import { NextResponse } from "next/server";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { buildRateFeed } from "@/lib/hms/rates/feed";
import { isDay } from "@/lib/hms/rates/pricing";

/**
 * GET /api/hotel/rates/grid?slug=&from=YYYY-MM-DD&days=30&plan=&roomType= — price, restrictions and
 * rooms left for every night, room type and plan. Add `format=feed` for one flat row per night, the
 * shape a website booking engine or channel manager reads.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "", ["revenue", "reservations", "frontdesk"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const from = url.searchParams.get("from");
  const fromDay = isDay(from) ? from : new Date().toISOString().slice(0, 10);
  const days = Math.min(120, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const feed = await buildRateFeed(auth.service, auth.tenant, {
    fromDay,
    days,
    plan: url.searchParams.get("plan") || null,
    roomTypeCode: url.searchParams.get("roomType") || null,
  });
  if (url.searchParams.get("format") === "feed") {
    return NextResponse.json({ currency: feed.currency, from: feed.fromDay, days: feed.days, nights: feed.nights });
  }
  return NextResponse.json(feed);
}
