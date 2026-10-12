import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { GOOGLE_FONT_NAME, googleFontCssUrl } from "@/lib/store/site/fonts";

/** Google answers with CSS for a family it has, and an error for one it doesn't. */
async function lookup(family: string, hasBold: boolean) {
  const res = await fetch(googleFontCssUrl(family, hasBold), { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  // The CSS names the family exactly as Google spells it.
  const name = (await res.text()).match(/font-family:\s*'([^']+)'/)?.[1];
  return name ?? family;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/**
 * GET /api/store/fonts/google?slug=&family= — whether Google Fonts has this
 * family, its exact name, and whether it comes in bold.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const resolved = await resolveStoreRequest(params.get("slug") || "");
  if (resolved.error) return resolved.error;

  const typed = (params.get("family") || "").trim().replace(/\s+/g, " ");
  if (!GOOGLE_FONT_NAME.test(typed)) return NextResponse.json({ error: "Enter a font name using letters and numbers only." }, { status: 400 });

  try {
    // Google's names are case-sensitive, so also try "Playfair Display" for "playfair display".
    for (const family of Array.from(new Set([typed, titleCase(typed)]))) {
      const withBold = await lookup(family, true);
      if (withBold) return NextResponse.json({ family: withBold, hasBold: true });
      const regularOnly = await lookup(family, false);
      if (regularOnly) return NextResponse.json({ family: regularOnly, hasBold: false });
    }
  } catch {
    return NextResponse.json({ error: "We couldn't reach Google Fonts. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ error: `We couldn't find "${typed}" on Google Fonts. Check the spelling on fonts.google.com.` }, { status: 404 });
}
