import { getStorefront } from "@/lib/store/site/storefront";

/**
 * robots.txt for a store, served at <store>.getxyvoo.com/robots.txt (the proxy
 * rewrites it here). Unpublished stores ask search engines to stay away.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) return new Response("Not found", { status: 404 });

  const body = storefront.isLive
    ? ["User-agent: *", "Allow: /", "Disallow: /cart", "Disallow: /checkout", "", `Sitemap: ${storefront.siteUrl}/sitemap.xml`, ""].join("\n")
    : ["User-agent: *", "Disallow: /", ""].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
