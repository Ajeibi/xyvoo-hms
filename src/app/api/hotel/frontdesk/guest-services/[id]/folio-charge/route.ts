import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";
import { appendGuestRequestEvent } from "@/lib/hms/guest-services";
import { insertFolioLine } from "@/lib/hms/folio";
import { loadReservation } from "@/app/api/hotel/folio/_lib";

const PostBody = z.object({
  slug: z.string().min(1),
  amount: z.coerce.number().nonnegative(),
  description: z.string().min(1).max(200),
  complimentary: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getGuestServicesCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canPostFolio) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: gr } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .select("id,reservation_id,department,request_type,folio_line_id")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (!gr) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (caps.departmentScope && (gr.department as string) !== caps.departmentScope) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }
    if (gr.folio_line_id) {
      return NextResponse.json({ error: "Charge already posted for this request." }, { status: 400 });
    }

    const amount = body.complimentary ? 0 : body.amount;
    if (!body.complimentary && amount <= 0) {
      return NextResponse.json({ error: "Amount must be positive unless complimentary." }, { status: 400 });
    }

    const reservation = await loadReservation(auth, gr.reservation_id as string);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const splitLeg =
      reservation.settlement_method === "direct_bill" ? ("company" as const) : ("guest" as const);

    const { line, error } = await insertFolioLine(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: gr.reservation_id as string,
      kind: "charge",
      amount,
      method: "system",
      description: body.description,
      department: (gr.department as string) ?? "guest_services",
      postedBy: auth.user.id,
      splitLeg,
      metadata: { guestRequestId: id, requestType: gr.request_type },
    });

    if (error || !line) return NextResponse.json({ error: error ?? "Could not post charge." }, { status: 500 });

    await auth.service
      .schema("hotel")
      .from("guest_requests")
      .update({
        folio_line_id: line.id,
        billable: amount > 0,
        service_amount: amount,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id);

    await appendGuestRequestEvent(auth.service, {
      tenantId: auth.tenant.id,
      guestRequestId: id,
      action: "folio_charge_posted",
      payload: { folioLineId: line.id, amount },
      actorUserId: auth.user.id,
    });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "guest_service_folio_posted",
      entityType: "guest_request",
      entityId: id,
      after: { folio_line_id: line.id, amount },
    });

    return NextResponse.json({ ok: true, line });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to post charge." }, { status: 500 });
  }
}
