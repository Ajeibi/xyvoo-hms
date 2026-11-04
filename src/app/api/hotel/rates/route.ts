import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { ensureDefaultPlan, loadRateBook } from "@/lib/hms/rates/book";
import {
  PlanInput,
  PriceInput,
  RestrictionInput,
  deletePlan,
  deletePriceRule,
  deleteRestriction,
  makeDefaultPlan,
  savePlan,
  savePriceRule,
  saveRestriction,
} from "@/lib/hms/rates/admin";

/**
 * GET /api/hotel/rates?slug= — the hotel's rate book: plans, price rules, restrictions.
 * POST — change it. One body, an `action` says what: plan, delete_plan, default_plan, price,
 * delete_price, restriction, delete_restriction. Changes are for owners and admins.
 */

const READERS = ["revenue", "reservations", "frontdesk"] as const;

async function payload(auth: Exclude<Awaited<ReturnType<typeof requireHotelApiSection>>, { error: string }>) {
  const book = await loadRateBook(auth.service, auth.tenant);
  const { data: companies } = await auth.service
    .schema("hotel")
    .from("ar_customers")
    .select("id,name")
    .eq("tenant_id", auth.tenant.id)
    .eq("status", "active")
    .order("name")
    .limit(500);
  return { book, companies: (companies ?? []).map((c) => ({ id: String(c.id), name: String(c.name) })), canManage: isAdminLikeRole(auth.role) };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "", [...READERS]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (isAdminLikeRole(auth.role)) {
    try {
      await ensureDefaultPlan(auth.service, auth.tenant.id, auth.user.id);
    } catch {
      /* the screen explains what's missing */
    }
  }
  return NextResponse.json(await payload(auth));
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), slug: z.string().min(1), plan: PlanInput }),
  z.object({ action: z.literal("delete_plan"), slug: z.string().min(1), id: z.string().uuid() }),
  z.object({ action: z.literal("default_plan"), slug: z.string().min(1), id: z.string().uuid() }),
  z.object({ action: z.literal("price"), slug: z.string().min(1), price: PriceInput }),
  z.object({ action: z.literal("delete_price"), slug: z.string().min(1), id: z.string().uuid() }),
  z.object({ action: z.literal("restriction"), slug: z.string().min(1), restriction: RestrictionInput }),
  z.object({ action: z.literal("delete_restriction"), slug: z.string().min(1), id: z.string().uuid() }),
]);

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, [...READERS]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change rates." }, { status: 403 });

    const ctx = { tenantId: auth.tenant.id, userId: auth.user.id };
    const book = await loadRateBook(auth.service, auth.tenant);
    const withTypes = { ...ctx, roomTypeIds: book.roomTypes.map((t) => t.id) };

    let result: { ok: boolean; error?: string };
    switch (body.action) {
      case "plan":
        result = await savePlan(auth.service, withTypes, body.plan);
        break;
      case "delete_plan":
        result = await deletePlan(auth.service, ctx, body.id);
        break;
      case "default_plan":
        result = await makeDefaultPlan(auth.service, ctx, body.id);
        break;
      case "price":
        result = await savePriceRule(auth.service, withTypes, body.price);
        break;
      case "delete_price":
        result = await deletePriceRule(auth.service, ctx, body.id);
        break;
      case "restriction":
        result = await saveRestriction(auth.service, withTypes, body.restriction);
        break;
      case "delete_restriction":
        result = await deleteRestriction(auth.service, ctx, body.id);
        break;
    }
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Not saved." }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await payload(auth)) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Check the details." }, { status: 400 });
    console.error("[api/hotel/rates]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
