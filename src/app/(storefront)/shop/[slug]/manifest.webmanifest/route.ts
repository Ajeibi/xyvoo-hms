import { NextResponse } from "next/server";
import { buildStoreAppManifest } from "@/lib/store/app";
import { getStorefront } from "@/lib/store/site/storefront";

/** The store's web app manifest, which makes the store installable as its own app. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { site, basePath, storeName } = storefront;
  const manifest = buildStoreAppManifest({
    basePath,
    storeName,
    description: site.seo.description || site.brand.tagline || null,
    backgroundColour: site.theme.colours.bg,
    themeColour: site.theme.colours.bg,
    lang: storefront.languages[0],
  });
  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
