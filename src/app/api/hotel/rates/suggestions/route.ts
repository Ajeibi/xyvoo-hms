import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { loadRateBook } from "@/lib/hms/rates/book";
import { decideSuggestion, generateSuggestions, getRevenueSettings, listSuggestions, saveRevenueSettings } from "@/lib/hms/rates/suggestions";

/**
 * GET /api/hotel/rates/suggestions?slug= — open suggestions, recent decisions and the limits.
 * POST — `refresh` (look again now), `accept` (optionally with a different price), `dismiss`, `settings`.
 * Changes are for owners and admins; accepting adds an ordinary price rule.
 */

const SECTIONS = ["revenue"] as const;

async function payload(auth: { service: Parameters<typeof listSuggestions>[0]; tenant: { id: string; room_types: unknown; pricing_setup: unknown }; role: string }) {
  const [open, decided, settings, book] = await Promise.all([
    listSuggestions(auth.service, auth.tenant.id, { status: "open" }),
    listSuggestions(auth.service, auth.tenant.id, { limit: 60 }).then((all) => all.filter((s) => s.status === "accepted" || s.status === "dismissed").slice(-20).reverse()),
    getRevenueSettings(auth.service, auth.tenant.id),
    loadRateBook(auth.service, auth.tenant),
  ]);
  return {
    open,
    decided,
    settings,
    currency: book.currency,
    roomTypes: book.roomTypes.map((t) => ({ id: t.id, name: t.name })),
    canManage: isAdminLikeRole(auth.role),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "", [...SECTIONS]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(await payload(auth));
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh"), slug: z.string().min(1) }),
  z.object({ action: z.literal("accept"), slug: z.string().min(1), id: z.string().uuid(), price: z.coerce.number().min(0).optional() }),
  z.object({ action: z.literal("dismiss"), slug: z.string().min(1), id: z.string().uuid() }),
  z.object({
    action: z.literal("settings"),
    slug: z.string().min(1),
    settings: z.object({
      suggestionsEnabled: z.boolean(),
      maxStepPercent: z.coerce.number(),
      floorPercent: z.coerce.number(),
      ceilingPercent: z.coerce.number(),
      horizonDays: z.coerce.number().int(),
    }),
  }),
]);

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, [...SECTIONS]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change prices." }, { status: 403 });
    const ctx = { tenantId: auth.tenant.id, userId: auth.user.id };

    if (body.action === "refresh") {
      const r = await generateSuggestions(auth.service, auth.tenant, auth.user.id);
      return NextResponse.json({ ok: true, created: r.created, ...(await payload(auth)) });
    }
    if (body.action === "settings") {
      const r = await saveRevenueSettings(auth.service, ctx, body.settings);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await payload(auth)) });
    }
    const book = await loadRateBook(auth.service, auth.tenant);
    const r = await decideSuggestion(auth.service, { ...ctx, roomTypeIds: book.roomTypes.map((t) => t.id) }, body.id, body.action, body.action === "accept" ? body.price : undefined);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await payload(auth)) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Check the details." }, { status: 400 });
    console.error("[api/hotel/rates/suggestions]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
