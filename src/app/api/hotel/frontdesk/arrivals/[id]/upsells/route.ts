import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { insertFolioLine } from "@/lib/hms/folio";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { loadOffer, loadOffers, loadStayUpsells, upsellAmount, upsellDescription } from "@/lib/hms/upsells";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const AcceptSchema = z.object({
  slug: z.string().min(1),
  offerId: z.string().uuid(),
});

async function loadStay(db: Parameters<typeof loadOffers>[0], tenantId: string, id: string) {
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,status,nights,adults,settlement_method")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  return data as { id: string; status: string; nights: number; adults: number; settlement_method: string } | null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const stay = await loadStay(auth.service, auth.tenant.id, id);
    if (!stay) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const [offers, accepted] = await Promise.all([
      loadOffers(auth.service, auth.tenant.id, { activeOnly: true }),
      loadStayUpsells(auth.service, auth.tenant.id, id),
    ]);
    return NextResponse.json(
      {
        offers: offers.map((o) => ({ ...o, amount: upsellAmount(o, stay) })),
        accepted,
        currency: normalizePricingSetup(auth.tenant.pricing_setup).currency,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = AcceptSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canPostFolioPayments) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const stay = await loadStay(auth.service, auth.tenant.id, id);
    if (!stay) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (!["confirmed", "checked_in"].includes(stay.status)) {
      return NextResponse.json({ error: "Extras can only be added before the guest checks out." }, { status: 409 });
    }
    const offer = await loadOffer(auth.service, auth.tenant.id, body.offerId);
    if (!offer || !offer.active) return NextResponse.json({ error: "That offer is not available." }, { status: 404 });

    const existing = await loadStayUpsells(auth.service, auth.tenant.id, id);
    if (existing.some((u) => u.offerId === offer.id)) {
      return NextResponse.json({ error: "The guest has already taken this extra." }, { status: 409 });
    }

    const amount = upsellAmount(offer, stay);
    const description = upsellDescription(offer, stay);
    let lineId: string | null = null;
    if (amount > 0) {
      const { line, error } = await insertFolioLine(auth.service, {
        tenantId: auth.tenant.id,
        reservationId: id,
        kind: "charge",
        amount,
        method: "system",
        description,
        department: offer.kind === "breakfast" ? "food_beverage" : "rooms",
        postedBy: auth.user.id,
        splitLeg: stay.settlement_method === "direct_bill" ? "company" : "guest",
        reference: `upsell:${offer.id}`,
        metadata: { upsellOfferId: offer.id, upsellKind: offer.kind },
      });
      if (error || !line) return NextResponse.json({ error: error ?? "Could not add it to the bill." }, { status: 500 });
      lineId = line.id;
    }

    const { error: recErr } = await auth.service.schema("hotel").from("reservation_upsells").insert({
      tenant_id: auth.tenant.id,
      reservation_id: id,
      offer_id: offer.id,
      kind: offer.kind,
      name: description,
      amount,
      folio_line_id: lineId,
      accepted_by: auth.user.id,
    });
    if (recErr) console.error("[upsell record]", recErr.message);

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "upsell_accepted",
      entityType: "reservation",
      entityId: id,
      after: { offer: offer.name, kind: offer.kind, amount, folioLineId: lineId },
    });
    return NextResponse.json({ ok: true, amount, description });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[upsells accept]", e);
    return NextResponse.json({ error: "Failed to add the extra." }, { status: 500 });
  }
}
