import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { getActiveCashFloatSession, insertFolioLine, openCashFloatSession } from "@/lib/hms/folio";
import { allocateGroupPayment, GROUP_PAYMENT_METHODS, loadGroups } from "@/lib/hms/frontdesk-groups";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const BodySchema = z.object({
  slug: z.string().min(1),
  amount: z.coerce.number().positive("Enter the amount received."),
  method: z.enum(GROUP_PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional(),
});

/**
 * One payment for the whole group, recorded against the room bills: each room takes up to what it
 * owes, in room order, so every room's own bill stays right and the master bill is their sum.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canPostFolioPayments) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const [group] = await loadGroups(auth.service, auth.tenant.id, id);
    if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });

    // Only rooms that are in the house have a bill to pay into.
    const payable = group.members.filter((m) => m.status === "checked_in" && m.balance > 0);
    const { allocations, remainder } = allocateGroupPayment(payable, body.amount);
    if (allocations.length === 0) {
      return NextResponse.json({ error: "No room in this group owes anything right now." }, { status: 409 });
    }
    if (remainder > 0) {
      return NextResponse.json(
        { error: `That is ${remainder.toFixed(2)} more than the group owes. Enter the amount received, up to what is owed.` },
        { status: 409 },
      );
    }

    let cashFloatSessionId: string | undefined;
    if (body.method === "cash") {
      let session = await getActiveCashFloatSession(auth.service, auth.tenant.id);
      if (!session) {
        const opened = await openCashFloatSession(auth.service, { tenantId: auth.tenant.id, openedBy: auth.user.id, openingBalance: 0 });
        if (!opened.session) return NextResponse.json({ error: opened.error ?? "Could not open the cash drawer." }, { status: 500 });
        session = opened.session;
      }
      cashFloatSessionId = session.id as string;
    }

    const currency = normalizePricingSetup(auth.tenant.pricing_setup).currency;
    const posted: string[] = [];
    for (const a of allocations) {
      const { line, error } = await insertFolioLine(auth.service, {
        tenantId: auth.tenant.id,
        reservationId: a.reservationId,
        kind: "payment",
        amount: a.amount,
        method: body.method,
        description: `Group payment (${body.method}) for ${group.name}`,
        postedBy: auth.user.id,
        reference: body.reference,
        splitLeg: "guest",
        currencyCode: currency,
        cashFloatSessionId,
        metadata: { groupBookingId: id },
      });
      if (error || !line) {
        return NextResponse.json(
          { error: `Part of the payment was recorded (${posted.length} of ${allocations.length} rooms). ${error ?? "Could not post"} Check the room bills.` },
          { status: 500 },
        );
      }
      posted.push(line.id);
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "group_payment_posted",
      entityType: "group_booking",
      entityId: id,
      after: { amount: body.amount, method: body.method, rooms: allocations.length },
    });
    return NextResponse.json({ ok: true, rooms: allocations.length, allocations });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[group payment]", e);
    return NextResponse.json({ error: "Failed to record the payment." }, { status: 500 });
  }
}
