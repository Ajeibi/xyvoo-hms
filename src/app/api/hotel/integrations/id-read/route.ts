import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { idReaderAvailable, readIdForReservation } from "@/lib/hms/integrations/id-reader/service";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];
const Body = z.object({ slug: z.string().min(1), reservationId: z.string().uuid() });
const noStore = { "Cache-Control": "no-store" };

/** GET ?slug=: is reading IDs from a photo switched on for this server? */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const auth = await requireHotelApiSection(slug, SECTIONS);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ available: idReaderAvailable() }, { headers: noStore });
}

/**
 * POST { slug, reservationId }: reads the ID photos saved on the booking and returns the details found.
 * Nothing is saved to the guest here; the check-in screen shows the proposal and staff accept it.
 */
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    if (!idReaderAvailable()) return NextResponse.json({ error: "Reading IDs from a photo is not switched on yet." }, { status: 503 });

    const result = await readIdForReservation(auth.service, { tenantId: auth.tenant.id, reservationId: body.reservationId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.retryable ? 502 : 422, headers: noStore });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "id_read_from_photo",
      entityType: "reservation",
      entityId: body.reservationId,
      after: { verified_by_strip: result.verifiedByMrz, fields: Object.keys(result.fields) },
    });
    return NextResponse.json({ ok: true, fields: result.fields, verifiedByMrz: result.verifiedByMrz, warnings: result.warnings }, { headers: noStore });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Check the details." }, { status: 400 });
    console.error("[integrations/id-read]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "That did not work. Please try again." }, { status: 500 });
  }
}
