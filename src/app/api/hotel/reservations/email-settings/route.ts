import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { getReservationEmailSettings, saveReservationEmailSettings } from "@/lib/hms/reservation-emails";

/** GET/POST the switches for the guest emails (confirmation, change, cancellation). Changes are for owners and admins. */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "", ["reservations", "frontdesk"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ settings: await getReservationEmailSettings(auth.service, auth.tenant.id), canManage: isAdminLikeRole(auth.role) });
}

const Post = z.object({
  slug: z.string().min(1),
  sendConfirmation: z.boolean(),
  sendChange: z.boolean(),
  sendCancellation: z.boolean(),
  extraNote: z.string().max(600),
});

export async function POST(req: Request) {
  try {
    const body = Post.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, ["reservations", "frontdesk"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });

    const settings = { sendConfirmation: body.sendConfirmation, sendChange: body.sendChange, sendCancellation: body.sendCancellation, extraNote: body.extraNote };
    const result = await saveReservationEmailSettings(auth.service, { tenantId: auth.tenant.id, userId: auth.user.id, settings });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await writeAuditLog({ tenantId: auth.tenant.id, actorUserId: auth.user.id, action: "reservation_email_settings_saved", entityType: "tenant", entityId: auth.tenant.id, after: settings });
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
