import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { resolveArrivalsDateRange, type ArrivalsDatePreset } from "@/lib/hms/arrivals-workbench";

const QuerySchema = z.object({
  slug: z.string().min(1),
  preset: z.enum(["today", "tomorrow", "week", "custom"]).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      preset: url.searchParams.get("preset") ?? "today",
      start: url.searchParams.get("start") ?? undefined,
      end: url.searchParams.get("end") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { startIso, endIso } = resolveArrivalsDateRange(
      (query.preset ?? "today") as ArrivalsDatePreset,
      new Date(),
      query.start,
      query.end,
    );

    const guestSelect = "first_name,last_name,title";
    const { data: rows } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select(
        `id,confirmation_code,arrival_at,status,vip_flag,room_unit_id,group_booking_id,reservation_guests(is_primary,guests(${guestSelect}))`,
      )
      .eq("tenant_id", auth.tenant.id)
      .gte("arrival_at", startIso)
      .lt("arrival_at", endIso)
      .not("status", "eq", "cancelled");

    const buckets = new Map<number, { hour: number; items: unknown[] }>();
    for (let h = 0; h < 24; h += 1) {
      buckets.set(h, { hour: h, items: [] });
    }

    for (const r of rows ?? []) {
      const hour = new Date(r.arrival_at).getUTCHours();
      const embeds = r.reservation_guests as unknown as {
        is_primary: boolean;
        guests:
          | { first_name: string; last_name: string; title: string | null }
          | { first_name: string; last_name: string; title: string | null }[]
          | null;
      }[] | null;
      const primary = embeds?.find((e) => e.is_primary) ?? embeds?.[0];
      const rawG = primary?.guests;
      const g = Array.isArray(rawG) ? rawG[0] : rawG;
      const guestName = g
        ? `${g.title?.trim() ? `${g.title.trim()} ` : ""}${g.first_name} ${g.last_name}`.trim()
        : "Guest";
      const bucket = buckets.get(hour);
      if (!bucket) continue;
      bucket.items.push({
        reservationId: r.id,
        confirmationCode: r.confirmation_code,
        guestName,
        arrivalAt: r.arrival_at,
        status: r.status,
        isVip: r.vip_flag,
        isGroup: Boolean(r.group_booking_id),
        highlight:
          r.status === "confirmed" && new Date(r.arrival_at).getTime() < Date.now() ? "delayed" : "none",
      });
    }

    return NextResponse.json({
      buckets: [...buckets.values()].filter((b) => b.items.length > 0),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Timeline failed." }, { status: 500 });
  }
}
