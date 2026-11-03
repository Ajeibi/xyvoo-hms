import { NextResponse } from "next/server";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { loadActiveAccessibility } from "@/lib/hms/accessibility-flags";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations", "housekeeping"];

/** Bookings that are arriving or in the house and carry an accessibility flag. */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const flags = await loadActiveAccessibility(auth.service, auth.tenant.id);
    return NextResponse.json({ flags }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}
