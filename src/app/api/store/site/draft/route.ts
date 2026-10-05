import { NextResponse } from "next/server";
import { z } from "zod";
import { saveSiteDraft, setSiteTemplate } from "@/lib/store/site/data";
import { loadEditorState, resolveEditorRequest } from "@/lib/store/site/editor-api";
import { siteOverridesSchema } from "@/lib/store/site/schema";
import { STOREFRONT_TEMPLATE_SLUGS } from "@/lib/store/site/templates";

const Schema = z.object({
  slug: z.string().min(1),
  /** Top-level parts of the site settings to replace (theme, brand, sections, navigation, content, seo). */
  patch: siteOverridesSchema.optional(),
  templateSlug: z.enum(STOREFRONT_TEMPLATE_SLUGS).optional(),
});

/**
 * POST /api/store/site/draft — saves editor changes to the draft. Customers
 * don't see them until the site is published.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveEditorRequest(body?.slug);
  if (resolved.error) return resolved.error;

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "Some of those settings aren't valid.", field: issue?.path.join(".") }, { status: 400 });
  }

  try {
    if (parsed.data.templateSlug) await setSiteTemplate(resolved.access.tenantId, parsed.data.templateSlug);
    if (parsed.data.patch && Object.keys(parsed.data.patch).length) await saveSiteDraft(resolved.access.tenantId, parsed.data.patch);
    return NextResponse.json(await loadEditorState(resolved.access.tenantId, resolved.access.storeDisplayName, resolved.access.logoUrl));
  } catch (error) {
    console.error("[site/draft] save failed", error);
    return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  }
}
