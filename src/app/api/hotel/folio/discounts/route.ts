import { NextResponse } from "next/server";
import { FOLIO_WINDOWS } from "@/lib/hms/folio";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fetchFolioLines, getTenantFolioSettings, verifyManagerPin } from "@/lib/hms/folio";
import { discountNeedsPin, discountRows, planDiscount, type DiscountRequest } from "@/lib/hms/folio-discounts";
import type { ExtraNightReservation } from "@/lib/hms/folio-extra-nights";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { loadFolioPayload, loadReservation } from "../_lib";

const BodySchema = z
  .object({
    slug: z.string().min(1),
    reservationId: z.string().uuid(),
    target: z.enum(["room", "bill"]).optional(),
    mode: z.enum(["percent", "amount"]).optional(),
    value: z.coerce.number().positive().optional(),
    reason: z.string().max(200).optional(),
    /** The folio screen's older form: a fixed amount off the bill with a description. */
    amount: z.coerce.number().positive().optional(),
    description: z.string().max(200).optional(),
    managerPin: z.string().optional(),
    splitLeg: z.enum(FOLIO_WINDOWS).optional(),
    source: z.enum(["checkout", "folio"]).optional(),
    /** Work out what would come off, without posting anything. */
    preview: z.boolean().optional(),
  })
  .refine((b) => b.value != null || b.amount != null, { message: "Enter a discount." });

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const request: DiscountRequest = {
      target: body.target ?? "bill",
      mode: body.mode ?? "amount",
      value: body.value ?? body.amount ?? 0,
      reason: body.reason ?? body.description ?? "",
    };
    const pricing = normalizePricingSetup(auth.tenant.pricing_setup);
    const lines = await fetchFolioLines(auth.service, auth.tenant.id, body.reservationId);
    const plan = planDiscount(lines, reservation as ExtraNightReservation, pricing, request);
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });

    const settings = await getTenantFolioSettings(auth.service, auth.tenant.id);
    const needsPin = !isAdminLikeRole(auth.role) && discountNeedsPin(plan.percentOfBill, settings.discountLimitPercent);

    if (body.preview) {
      return NextResponse.json({ ok: true, preview: true, lines: plan.lines, total: plan.total, needsPin });
    }

    if (needsPin) {
      const allowed = await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role);
      if (!allowed) {
        return NextResponse.json(
          {
            error: body.managerPin ? "That manager PIN isn't right." : "This discount needs a manager's PIN.",
            requiresPin: true,
          },
          { status: 403 },
        );
      }
    }

    const rows = discountRows(plan, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      postedBy: auth.user.id,
      currency: pricing.currency,
      splitLeg: body.splitLeg ?? "guest",
      windowSet: Boolean(body.splitLeg),
      request,
      source: body.source ?? "folio",
    });
    const { data: inserted, error } = await auth.service.schema("hotel").from("folio_transactions").insert(rows).select("id");
    if (error || !inserted?.length) return NextResponse.json({ error: "Could not apply the discount." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_discount_applied",
      entityType: "folio_transaction",
      entityId: inserted[0]!.id as string,
      after: {
        ...request,
        total: plan.total,
        percentOfBill: plan.percentOfBill,
        source: body.source ?? "folio",
        managerPinUsed: needsPin,
      },
    });

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, total: plan.total, folio: payload?.folio, stay: payload?.stay });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
