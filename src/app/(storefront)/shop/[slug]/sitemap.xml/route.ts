import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STORE_PATHS } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * sitemap.xml for a store, served at <store>.getxyvoo.com/sitemap.xml. Lists
 * the home page, the shop and its categories, every visible product, and the
 * store's collections and published pages, all on the store's subdomain.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront || !storefront.isLive) return new Response("Not found", { status: 404 });

  const { data: products } = await createServerSupabaseClient()
    .schema("store")
    .from("products")
    .select("id, slug, updated_at")
    .eq("tenant_id", storefront.tenant.id)
    .eq("status", "active")
    .eq("visibility", "visible")
    .eq("approval_status", "approved")
    .order("updated_at", { ascending: false })
    .limit(5000);

  const entries: Array<{ path: string; lastModified?: string }> = [
    { path: "/" },
    { path: STORE_PATHS.products },
    ...storefront.categories.map((c) => ({ path: STORE_PATHS.category(c) })),
    ...(products || []).map((p) => ({ path: STORE_PATHS.product((p.slug as string | null) || (p.id as string)), lastModified: p.updated_at as string })),
    ...storefront.collections.map((c) => ({ path: STORE_PATHS.collection(c.slug) })),
    ...storefront.pages.map((p) => ({ path: STORE_PATHS.page(p.slug) })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((e) => {
      const loc = `<loc>${escapeXml(e.path === "/" ? storefront.siteUrl : `${storefront.siteUrl}${e.path}`)}</loc>`;
      const lastmod = e.lastModified ? `<lastmod>${new Date(e.lastModified).toISOString()}</lastmod>` : "";
      return `  <url>${loc}${lastmod}</url>`;
    }),
    "</urlset>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
