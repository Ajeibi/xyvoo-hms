import { NextResponse } from "next/server";
import { z } from "zod";
import { HOTEL_TEMPLATE_IDS } from "@/lib/hms/site/constants";
import { reservationsEmailSchema } from "@/lib/hms/site/readiness";
import { getHotelSite, logSiteActivity, saveSiteSettings } from "@/lib/hms/site/site";
import { loadWebsiteState, requireWebsiteAdmin } from "@/lib/hms/site/state";
import { getWebConfig, saveWebConfig } from "@/lib/hms/site/web-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const Body = z.object({
  slug: z.string().min(1),
  templateId: z.enum(HOTEL_TEMPLATE_IDS).optional(),
  reservationsEmail: z.union([reservationsEmailSchema, z.literal("")]).optional(),
  bookingMode: z.enum(["instant", "request"]).optional(),
  paymentNote: z.string().max(800).optional(),
  abandonedReminders: z.boolean().optional(),
});

/** GET /api/hotel/website?slug= — the hotel's website settings. Owners and admins only. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  const result = await requireWebsiteAdmin(slug);
  if ("response" in result) return result.response;
  return NextResponse.json(await loadWebsiteState(result.auth.tenant, slug));
}

/** PUT /api/hotel/website { slug, templateId?, reservationsEmail? } — saves the template and the reservations email. */
export async function PUT(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || "Check the details." }, { status: 400 });
  const { slug, bookingMode, paymentNote, abandonedReminders, ...changes } = body.data;

  const result = await requireWebsiteAdmin(slug);
  if ("response" in result) return result.response;
  const { auth, actor } = result;

  try {
    const before = await getHotelSite(auth.tenant.id);
    // A published site must keep an inbox for its requests.
    if (before?.published && changes.reservationsEmail === "") {
      return NextResponse.json({ error: "A published website needs a reservations email. Unpublish it first to remove it." }, { status: 400 });
    }
    await saveSiteSettings({ id: auth.tenant.id, slug }, changes);

    const db = createServerSupabaseClient();
    const beforeConfig = await getWebConfig(db, auth.tenant.id);
    if (bookingMode !== undefined || paymentNote !== undefined || abandonedReminders !== undefined) {
      const saved = await saveWebConfig(db, auth.tenant.id, { bookingMode, paymentNote, abandonedReminders });
      if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
    }

    const changed: Record<string, { from: string | null; to: string | null }> = {};
    if (bookingMode !== undefined && bookingMode !== beforeConfig.bookingMode) changed.booking_mode = { from: beforeConfig.bookingMode, to: bookingMode };
    if (paymentNote !== undefined && paymentNote.trim() !== (beforeConfig.paymentNote ?? "")) changed.payment_note = { from: beforeConfig.paymentNote, to: paymentNote.trim() || null };
    if (abandonedReminders !== undefined && abandonedReminders !== beforeConfig.abandonedReminders) changed.abandoned_reminders = { from: String(beforeConfig.abandonedReminders), to: String(abandonedReminders) };
    if (changes.templateId !== undefined && changes.templateId !== before?.templateId) changed.template = { from: before?.templateId ?? null, to: changes.templateId };
    if (changes.reservationsEmail !== undefined && changes.reservationsEmail !== (before?.reservationsEmail ?? "")) {
      changed.reservations_email = { from: before?.reservationsEmail ?? null, to: changes.reservationsEmail || null };
    }
    if (Object.keys(changed).length) await logSiteActivity({ tenantId: auth.tenant.id, actor, action: "updated", changes: changed });
    return NextResponse.json(await loadWebsiteState(auth.tenant, slug));
  } catch (error) {
    console.error("[hotel website PUT]", error);
    return NextResponse.json({ error: "Failed to save the website settings." }, { status: 500 });
  }
}
