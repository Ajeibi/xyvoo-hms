import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { getBusinessDate } from "@/lib/hms/business-date";
import { saveNightAuditSettings } from "@/lib/hms/night-audit-settings";

const Body = z.object({
  slug: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  autoRun: z.boolean(),
  autoRunHour: z.coerce.number().int().min(0).max(23),
  processNoShows: z.boolean(),
  noShowMode: z.enum(["mark_only", "keep_deposit", "policy"]),
  emailReport: z.boolean(),
  extraRecipients: z.string().max(500),
});

/** Saves the hotel's night audit settings. Owners and admins only. */
export async function PUT(req: Request) {
  try {
    const { slug, ...settings } = Body.parse(await req.json());
    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change the night audit settings." }, { status: 403 });

    const { today } = await getBusinessDate(auth.service, auth.tenant.id);
    const saved = await saveNightAuditSettings(auth.service, { tenantId: auth.tenant.id, userId: auth.user.id, settings, today });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[night-audit settings PUT]", e);
    return NextResponse.json({ error: "Failed to save the settings." }, { status: 500 });
  }
}
