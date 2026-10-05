import type { NextConfig } from "next";

// Storefront product and site images are uploaded to Supabase Storage; allow
// next/image to optimise those (and only those) public objects.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  async headers() {
    return [
      {
        // Static website-template showcases (built by `npm run templates:build`).
        // Demo content only, so keep them out of search results.
        source: "/template-previews/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/website", destination: "/", permanent: true },
      { source: "/website/:path*", destination: "/:path*", permanent: true },
      { source: "/home", destination: "/", permanent: true },
      { source: "/home/:path*", destination: "/:path*", permanent: true },
      { source: "/solutions/hotel", destination: "/solution/hms", permanent: true },
    ];
  },
};

export default nextConfig;
