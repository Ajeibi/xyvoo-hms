import { NextResponse } from "next/server";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { getGuestsDirectory } from "@/lib/hms/guests-directory";

/** GET /api/hotel/reservations/guest-search?slug=&q= — guests already on file, to book for. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "", ["reservations", "frontdesk"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ guests: [] });
  const payload = await getGuestsDirectory(auth.tenant.id, { search: q, page: 1, pageSize: 6 });
  return NextResponse.json({
    guests: payload.rows
      .filter((g) => !g.anonymised)
      .map((g) => ({ id: g.id, name: g.displayName, phone: g.phone, email: g.email, isVip: g.isVip, visitCount: g.visitCount, tier: g.tier })),
  });
}
