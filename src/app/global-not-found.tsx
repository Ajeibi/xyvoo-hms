import "./globals.css";
import type { Metadata } from "next";
import { STOREFRONT_ROOT_DOMAIN } from "@/lib/store/subdomain";

/*
 * The 404 page for addresses that don't belong to anything: unknown platform
 * pages, and store addresses no shop uses (or a store's root layout calling
 * notFound()). The app has two root layouts, so this page brings its own
 * <html> and styles. Pages missing inside a real shop use that shop's own
 * not-found page instead, with its header and footer.
 */

const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${STOREFRONT_ROOT_DOMAIN}`;

export const metadata: Metadata = {
  title: "Page not found | XYVOO",
  description: "We can't find the page or shop you were looking for.",
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en-GB">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
          <a href={appUrl} className="mb-10 inline-block rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">
            {/* eslint-disable-next-line @next/next/no-img-element -- this page renders outside the image optimiser's layouts */}
            <img src="/images/xyvoo-logo.png" alt="XYVOO home" width={120} height={32} className="h-8 w-auto" />
          </a>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Error 404</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">We can&rsquo;t find that page</h1>
          <p className="mt-4 text-base leading-relaxed text-slate-700">
            The link may be mistyped, or the page has moved. If you were looking for a shop, check the web address: the shop may have changed its
            name or closed.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <a href={appUrl} className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
              Go to the XYVOO home page
            </a>
            <a href={`${appUrl}/contact`} className="rounded-lg px-5 py-3 text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
              Contact us
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
