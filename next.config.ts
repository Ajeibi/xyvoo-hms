import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/website", destination: "/home", permanent: true },
      { source: "/website/:path*", destination: "/home/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
