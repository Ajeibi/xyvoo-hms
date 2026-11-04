import { NextResponse } from "next/server";
import { z } from "zod";
import { missingForPublish } from "@/lib/hms/site/readiness";
import { getHotelSite, logSiteActivity, setSitePublished } from "@/lib/hms/site/site";
import { loadWebsiteState, requireWebsiteAdmin } from "@/lib/hms/site/state";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";

const Body = z.object({ slug: z.string().min(1), published: z.boolean() });

/** POST /api/hotel/website/publish { slug, published } — puts the website live, or takes it down. Owners and admins only. */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Check the details." }, { status: 400 });
  const { slug, published } = body.data;

  const result = await requireWebsiteAdmin(slug);
  if ("response" in result) return result.response;
  const { auth, actor } = result;

  try {
    const site = await getHotelSite(auth.tenant.id);
    if (published) {
      const missing = missingForPublish({
        templateId: site?.templateId ?? null,
        address: site?.address ?? null,
        reservationsEmail: site?.reservationsEmail ?? null,
        roomTypes: normalizeRoomTypes(auth.tenant.room_types),
      });
      if (missing.length) return NextResponse.json({ error: `Before you publish: ${missing.join("; ").toLowerCase()}.`, missing }, { status: 400 });
    }
    if (!site) return NextResponse.json({ error: "Choose a template first." }, { status: 400 });

    if (site.published !== published) {
      await setSitePublished(auth.tenant.id, published);
      await logSiteActivity({ tenantId: auth.tenant.id, actor, action: published ? "published" : "unpublished" });
    }
    return NextResponse.json(await loadWebsiteState(auth.tenant, slug));
  } catch (error) {
    console.error("[hotel website publish]", error);
    return NextResponse.json({ error: "Failed to update the website." }, { status: 500 });
  }
}
