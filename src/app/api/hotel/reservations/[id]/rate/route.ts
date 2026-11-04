import { NextResponse } from "next/server";
import { requireReservationsApi } from "@/lib/hms/reservations-api";

/** GET — the rate a booking was sold on: the plan, the price of each night and any exception a manager allowed. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireReservationsApi(new URL(req.url).searchParams.get("slug") ?? "");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: r } = await auth.service
    .schema("hotel")
    .from("reservations")
    .select("rate_per_night,total_room_charges,pricing_snapshot")
    .eq("tenant_id", auth.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!r) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const s = (r.pricing_snapshot ?? {}) as Record<string, unknown>;
  const nights = Array.isArray(s.nightlySource)
    ? (s.nightlySource as { date?: unknown; base?: unknown; label?: unknown }[]).flatMap((n) =>
        typeof n.date === "string" ? [{ date: n.date, base: Number(n.base) || 0, label: typeof n.label === "string" ? n.label : null }] : [],
      )
    : [];
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return NextResponse.json({
    planCode: text(s.ratePlanCode),
    planName: text(s.ratePlanName),
    averageRate: Number(r.rate_per_night) || 0,
    roomTotal: Number(r.total_room_charges) || 0,
    nights,
    restrictionOverride: text(s.restrictionOverride),
  });
}
