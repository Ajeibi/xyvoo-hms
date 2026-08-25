import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/website", destination: "/", permanent: true },
      { source: "/website/:path*", destination: "/:path*", permanent: true },
      { source: "/home", destination: "/", permanent: true },
      { source: "/home/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
