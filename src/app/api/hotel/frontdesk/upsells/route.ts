import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { loadOffers, mapOffer, UPSELL_KINDS, UPSELL_UNITS } from "@/lib/hms/upsells";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const CreateSchema = z.object({
  slug: z.string().min(1),
  kind: z.enum(UPSELL_KINDS),
  name: z.string().trim().min(1, "Give the offer a name.").max(80),
  description: z.string().trim().max(200).optional(),
  price: z.coerce.number().min(0, "The price can't be below zero.").max(100000000),
  unit: z.enum(UPSELL_UNITS).default("flat"),
});

const UpdateSchema = z.object({
  slug: z.string().min(1),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(200).optional(),
  price: z.coerce.number().min(0).max(100000000).optional(),
  unit: z.enum(UPSELL_UNITS).optional(),
  active: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const offers = await loadOffers(auth.service, auth.tenant.id);
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    return NextResponse.json(
      { offers, canManage: caps.canBulkActions, currency: normalizePricingSetup(auth.tenant.pricing_setup).currency },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Failed to load offers." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canBulkActions) return NextResponse.json({ error: "Only a manager can set the offers and prices." }, { status: 403 });

    const { data, error } = await auth.service
      .schema("hotel")
      .from("upsell_offers")
      .insert({
        tenant_id: auth.tenant.id,
        kind: body.kind,
        name: body.name,
        description: body.description || null,
        price: body.price,
        unit: body.unit,
      })
      .select("id,kind,name,description,price,unit,active")
      .single();
    if (error || !data) {
      console.error("[upsells POST]", error?.message);
      return NextResponse.json({ error: "Could not save the offer." }, { status: 500 });
    }
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "upsell_offer_created",
      entityType: "upsell_offer",
      entityId: data.id as string,
      after: { name: body.name, price: body.price, unit: body.unit },
    });
    return NextResponse.json({ ok: true, offer: mapOffer(data) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[upsells POST]", e);
    return NextResponse.json({ error: "Failed to save the offer." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = UpdateSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canBulkActions) return NextResponse.json({ error: "Only a manager can set the offers and prices." }, { status: 403 });

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description || null;
    if (body.price !== undefined) update.price = body.price;
    if (body.unit !== undefined) update.unit = body.unit;
    if (body.active !== undefined) update.active = body.active;
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

    const { data, error } = await auth.service
      .schema("hotel")
      .from("upsell_offers")
      .update(update)
      .eq("tenant_id", auth.tenant.id)
      .eq("id", body.id)
      .select("id,kind,name,description,price,unit,active")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Could not save the offer." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "upsell_offer_updated",
      entityType: "upsell_offer",
      entityId: body.id,
      after: update,
    });
    return NextResponse.json({ ok: true, offer: mapOffer(data) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[upsells PATCH]", e);
    return NextResponse.json({ error: "Failed to save the offer." }, { status: 500 });
  }
}
