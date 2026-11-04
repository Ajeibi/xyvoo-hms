import { BOOKING_REQUEST_ENDPOINT } from "./constants";

/**
 * The hotel templates are static HTML built into public/template-previews/<template>/ (see
 * design/storefront-templates). A hotel's site serves those same files, so the look is the template's
 * own, with only what belongs to this hotel changed: shared files load from the template's folder,
 * the booking form posts to this site's own origin, and the page says where its canonical address is.
 */

const NOINDEX = '<meta name="robots" content="noindex, nofollow">';
const SKIP_URL = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;

/** Page links stay relative (they work from /<page>.html on the hotel's address and /stay/<slug>/<page>.html); files are not pages. */
function assetUrl(templateId: string, value: string) {
  if (SKIP_URL.test(value)) return value;
  const file = value.split(/[?#]/)[0];
  return file.endsWith(".html") ? value : `/template-previews/${templateId}/${value}`;
}

export function renderHotelPage(
  html: string,
  options: { templateId: string; hotelSlug: string; canonicalUrl: string; live: boolean; /** Serve the template's script from this hotel's own /site.js (its currency and live prices). */ ownScript?: boolean },
): string {
  const { templateId, hotelSlug, canonicalUrl, live } = options;
  let out = html.replace(/\b(href|src)="([^"]*)"/g, (_, attr: string, value: string) => `${attr}="${assetUrl(templateId, value)}"`);
  if (options.ownScript) out = out.replace(`src="/template-previews/${templateId}/main.js`, 'src="site.js');

  out = out.replace(/data-endpoint=""/g, `data-endpoint="${BOOKING_REQUEST_ENDPOINT}"`);
  out = out.replace(/data-hotel="[^"]*"/g, `data-hotel="${hotelSlug}"`);

  if (live) out = out.replace(NOINDEX, '<meta name="robots" content="index, follow">');
  out = out.replace("</head>", `  <link rel="canonical" href="${canonicalUrl}">\n</head>`);

  if (!live) {
    out = out.replace(
      /<body[^>]*>/,
      (open) => `${open}<div role="note" style="background:#1f2937;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center">Draft preview: this website is not published, only your team can see it.</div>`,
    );
  }
  return out;
}

/** Pages that are not worth a search result: a guest's own confirmation and booking lookup. */
const NOT_INDEXED_PAGES = new Set(["booking-confirmation.html", "manage-booking.html", "404.html"]);

export function sitemapXml(baseUrl: string, files: string[]) {
  const urls = files
    .filter((file) => !NOT_INDEXED_PAGES.has(file))
    .map((file) => `  <url><loc>${baseUrl}${file === "index.html" ? "/" : `/${file}`}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(baseUrl: string, live: boolean) {
  return live ? `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n";
}
