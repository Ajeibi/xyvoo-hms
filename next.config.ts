import type { NextConfig } from "next";

// Storefront product and site images are uploaded to Supabase Storage; allow
// next/image to optimise those (and only those) public objects.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;

/**
 * Where pages may load things from: our own origin, Supabase (images, files,
 * auth), Paystack, Google sign-in and Google Fonts (a merchant's chosen font).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://js.paystack.co",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  `img-src 'self' data: blob: https:`,
  "font-src 'self' data: https://fonts.gstatic.com" + (supabaseHost ? ` https://${supabaseHost}` : ""),
  `connect-src 'self' https://api.paystack.co https://accounts.google.com${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ""}`,
  "frame-src 'self' https://accounts.google.com https://checkout.paystack.com",
  "frame-ancestors 'self'",
  "form-action 'self' https://checkout.paystack.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    // src/app/global-not-found.tsx: one branded 404 for both root layouts
    // (platform and storefront), including unknown store addresses.
    globalNotFound: true,
  },
  // Receipts and report PDFs are made in API routes and read these fonts from disk.
  outputFileTracingIncludes: {
    "/api/**/*": ["./src/assets/fonts/**/*"],
  },
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  async headers() {
    return [
      {
        // Every page: HTTPS only, no MIME sniffing, a sensible referrer, and no
        // framing by other sites (the website editor frames shops from our own origin).
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Isolates our windows from other sites' pages; "allow-popups" keeps the
          // Google sign-in and Paystack popups able to report back.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // Report-only first: the browser console shows what this policy would block,
          // without blocking it. Enforce once a week of normal use shows no surprises.
          { key: "Content-Security-Policy-Report-Only", value: CONTENT_SECURITY_POLICY },
        ],
      },
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
