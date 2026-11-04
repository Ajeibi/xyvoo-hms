import { NextResponse } from "next/server";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { loadActiveAccessibility } from "@/lib/hms/accessibility-flags";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations", "housekeeping"];

/** Bookings arriving or in the house that carry an accessibility flag, and those already checked in online. */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const [flags, online] = await Promise.all([
      loadActiveAccessibility(auth.service, auth.tenant.id),
      auth.service.schema("hotel").from("online_checkins").select("reservation_id").eq("tenant_id", auth.tenant.id).not("submitted_at", "is", null).limit(1000),
    ]);
    const onlineDone = (online.data ?? []).map((r) => r.reservation_id as string);
    return NextResponse.json({ flags, onlineDone }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}
