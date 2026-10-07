const r2Host = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  ? new URL(process.env.NEXT_PUBLIC_R2_PUBLIC_URL).hostname
  : undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Load BlockNote's server renderer outside the RSC bundle so it uses the normal
  // React build (it imports React context code that the react-server build lacks).
  serverExternalPackages: ["@blocknote/server-util"],
  images: {
    remotePatterns: [
      // Cloudflare R2 public dev URLs (pub-xxxx.r2.dev)
      { protocol: "https", hostname: "**.r2.dev" },
      // The configured public bucket URL (covers custom domains)
      ...(r2Host ? [{ protocol: "https", hostname: r2Host }] : []),
    ],
  },
};

module.exports = nextConfig;
