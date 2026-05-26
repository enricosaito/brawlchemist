/** @type {import('next').NextConfig} */
const nextConfig = {
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
}

export default nextConfig
