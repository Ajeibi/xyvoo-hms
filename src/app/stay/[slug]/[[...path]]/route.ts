import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getWebsiteTemplate } from "@/constants/website-templates";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { HOTEL_PREVIEW_COOKIE, HOTEL_SITE_HOST_HEADER, isHotelTemplateId } from "@/lib/hms/site/constants";
import { LIVE_RATES_SCRIPT, withHotelBooking, withHotelCurrency } from "@/lib/hms/site/live-rates";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { renderHotelPage, robotsTxt, sitemapXml } from "@/lib/hms/site/render";
import { getHotelSite } from "@/lib/hms/site/site";
import { storefrontUrl } from "@/lib/store/subdomain";

/*
 * A hotel's public website. The proxy sends <address>.getxyvoo.com/<page> here as
 * /stay/<hotel>/<page>; the same URL also works on the platform domain, which is how staff
 * preview the draft. The pages are the chosen template's static HTML, read from
 * public/template-previews/<template>/ and lightly rewritten (src/lib/hms/site/render.ts).
 * Served by a route (not files) so an unpublished site can answer 404 and so the page
 * can carry this hotel's canonical address and booking endpoint.
 */

const PAGE = /^[a-z0-9-]+\.html$/;

function notFound() {
  return new NextResponse(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1rem"><h1>Page not found</h1><p>There is no website at this address.</p></body></html>',
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path: segments = [] } = await params;
  if (!/^[a-z0-9-]{1,63}$/i.test(slug)) return notFound();

  const tenant = await getHotelTenantBySlug(slug);
  const site = tenant ? await getHotelSite(tenant.id) : null;
  if (!tenant || !site || !site.address || !isHotelTemplateId(site.templateId)) return notFound();
  const template = getWebsiteTemplate(site.templateId);
  if (!template) return notFound();

  // An unpublished site is only for signed-in staff of this hotel who opened the draft preview.
  const live = site.published;
  if (!live) {
    const wantsPreview = (await cookies()).get(HOTEL_PREVIEW_COOKIE)?.value === "1";
    if (!wantsPreview || "error" in (await requireHotelApiMember(slug))) return notFound();
  }

  // Set by the proxy only, when the request came in on the hotel's own address.
  const onOwnAddress = (await headers()).get(HOTEL_SITE_HOST_HEADER) === slug.toLowerCase();
  const baseUrl = storefrontUrl(site.address);
  const cacheControl = live ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300" : "private, no-store";
  const pageFiles = template.pages.map((p) => p.file);

  const rest = segments.join("/");
  if (rest === "robots.txt") return new NextResponse(robotsTxt(baseUrl, live), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cacheControl } });
  if (rest === "sitemap.xml") {
    if (!live) return notFound();
    return new NextResponse(sitemapXml(baseUrl, pageFiles), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": cacheControl } });
  }

  // The template's script, in this hotel's currency, with the live prices from its rate book on the end.
  if (rest === "site.js") {
    try {
      const script = await readFile(path.join(process.cwd(), "public", "template-previews", site.templateId, "main.js"), "utf8");
      const currency = normalizePricingSetup(tenant.pricing_setup).currency;
      return new NextResponse(`${withHotelBooking(withHotelCurrency(script, currency))}\n${LIVE_RATES_SCRIPT}`, {
        headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": cacheControl },
      });
    } catch {
      return notFound();
    }
  }

  // The relative links inside the pages need a folder to resolve from, so /stay/<hotel> goes to its home page.
  if (!rest && !onOwnAddress) return NextResponse.redirect(new URL(`/stay/${slug}/index.html`, request.url));
  const file = rest || "index.html";
  if (!PAGE.test(file) || (!pageFiles.includes(file) && !["privacy.html", "cookies.html", "404.html"].includes(file))) return notFound();

  let html: string;
  try {
    html = await readFile(path.join(process.cwd(), "public", "template-previews", site.templateId, file), "utf8");
  } catch {
    return notFound();
  }

  const body = renderHotelPage(html, { templateId: site.templateId, hotelSlug: slug, canonicalUrl: `${baseUrl}${file === "index.html" ? "/" : `/${file}`}`, live, ownScript: true });
  return new NextResponse(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cacheControl } });
}
