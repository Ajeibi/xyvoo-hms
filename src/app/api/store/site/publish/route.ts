import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { getGoLiveStatus, publishSite, unpublishSite } from "@/lib/store/go-live";

const Schema = z.object({ slug: z.string().min(1), action: z.enum(["publish", "unpublish"]) });

/**
 * POST /api/store/site/publish { slug, action } — owner or admin. Publishing
 * needs a product on sale and a way to take payment; unpublishing shows
 * customers "opening soon" again.
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const resolved = await resolveStoreRequest(parsed.data.slug);
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) {
    return NextResponse.json({ error: "Only the store owner or an admin can publish the shop." }, { status: 403 });
  }

  try {
    if (parsed.data.action === "unpublish") {
      await unpublishSite(resolved.access.tenantId);
    } else {
      const status = await getGoLiveStatus(resolved.access.tenantId);
      if (!status.canPublish) {
        const missing = status.items.filter((i) => i.required && !i.done && i.key !== "publish").map((i) => i.label.toLowerCase());
        return NextResponse.json({ error: `Before publishing, please ${missing.join(" and ")}.` }, { status: 409 });
      }
      await publishSite(resolved.access.tenantId, resolved.access.userId);
    }
  } catch (error) {
    console.error("[site/publish]", error);
    return NextResponse.json({ error: "We couldn't update your shop just now. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: await getGoLiveStatus(resolved.access.tenantId) });
}
