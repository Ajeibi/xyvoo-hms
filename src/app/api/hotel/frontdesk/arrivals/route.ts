import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import {
  getArrivalsWorkbenchData,
  type ArrivalsDatePreset,
  type ArrivalsWorkbenchFilters,
} from "@/lib/hms/arrivals-workbench";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import type { PaymentDisplayStatus } from "@/lib/hms/front-desk-board";

const QuerySchema = z.object({
  slug: z.string().min(1),
  preset: z.enum(["today", "tomorrow", "week", "custom"]).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().optional(),
  payment: z.string().optional(),
  roomReadiness: z.string().optional(),
  vipOnly: z.enum(["true", "false"]).optional(),
  source: z.string().optional(),
  q: z.string().max(120).optional(),
});

function splitCsv(value?: string) {
  return value?.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      preset: url.searchParams.get("preset") ?? "today",
      start: url.searchParams.get("start") ?? undefined,
      end: url.searchParams.get("end") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      payment: url.searchParams.get("payment") ?? undefined,
      roomReadiness: url.searchParams.get("roomReadiness") ?? undefined,
      vipOnly: url.searchParams.get("vipOnly") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const currency = normalizePricingSetup(auth.tenant.pricing_setup).currency;
    const filters: ArrivalsWorkbenchFilters = {};
    const statusList = splitCsv(query.status);
    if (statusList?.length) filters.status = statusList;
    const paymentList = splitCsv(query.payment) as PaymentDisplayStatus[] | undefined;
    if (paymentList?.length) filters.payment = paymentList;
    const readinessList = splitCsv(query.roomReadiness) as ArrivalsWorkbenchFilters["roomReadiness"];
    if (readinessList?.length) filters.roomReadiness = readinessList;
    if (query.vipOnly === "true") filters.vipOnly = true;
    const sourceList = splitCsv(query.source);
    if (sourceList?.length) filters.source = sourceList;
    if (query.q?.trim()) filters.q = query.q.trim();

    const data = await getArrivalsWorkbenchData({
      tenantId: auth.tenant.id,
      currency,
      preset: (query.preset ?? "today") as ArrivalsDatePreset,
      customStart: query.start,
      customEnd: query.end,
      filters,
    });

    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[arrivals GET]", e);
    return NextResponse.json({ error: "Failed to load arrivals." }, { status: 500 });
  }
}
