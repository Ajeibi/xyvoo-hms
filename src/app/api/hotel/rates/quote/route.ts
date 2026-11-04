import { NextResponse } from "next/server";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { isDay } from "@/lib/hms/rates/pricing";
import { quoteStayAllPlans } from "@/lib/hms/rates/quote";

/**
 * GET /api/hotel/rates/quote?slug=&arrival=&departure=&adults=2&children=0&roomType=&plan=&channel=&company=
 *
 * Every plan each room type can be sold on for the stay, with nightly prices, taxes, conditions
 * and anything that stops it being booked (`issues`). Leave `roomType` out to quote every room
 * type; leave `plan` out to quote every plan. This is the call the new-booking screen, the
 * website engine and a channel manager use.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "", ["revenue", "reservations", "frontdesk"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const arrival = url.searchParams.get("arrival");
  const departure = url.searchParams.get("departure");
  if (!isDay(arrival) || !isDay(departure)) return NextResponse.json({ error: "Choose both dates." }, { status: 400 });

  const result = await quoteStayAllPlans(auth.service, auth.tenant, {
    arrivalDay: arrival,
    departureDay: departure,
    adults: Math.min(20, Math.max(1, Number(url.searchParams.get("adults")) || 2)),
    children: Math.min(20, Math.max(0, Number(url.searchParams.get("children")) || 0)),
    roomTypeCode: url.searchParams.get("roomType") || null,
    plan: url.searchParams.get("plan") || null,
    channel: url.searchParams.get("channel") || null,
    arCustomerId: url.searchParams.get("company") || null,
    bookedOn: new Date().toISOString().slice(0, 10),
    onlyBookable: url.searchParams.get("onlyBookable") === "1",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
