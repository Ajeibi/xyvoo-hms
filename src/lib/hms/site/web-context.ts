import { NextResponse } from "next/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { hotelSlugForRequest } from "./booking";
import { getHotelSite, type HotelSite } from "./site";

/*
 * Which hotel a public website route is talking to. It comes from where the request was made (the
 * hotel's own address, or the staff preview), never from the body. A draft site answers only
 * signed-in staff of that hotel.
 */

export type WebHotelContext = {
  slug: string;
  tenant: NonNullable<Awaited<ReturnType<typeof getHotelTenantBySlug>>>;
  site: HotelSite;
};

export async function resolveWebHotel(request: Request): Promise<{ ok: true; ctx: WebHotelContext } | { ok: false; response: NextResponse }> {
  const fail = (error: string, status: number) => ({ ok: false as const, response: NextResponse.json({ error }, { status }) });
  const slug = await hotelSlugForRequest(request);
  if (!slug) return fail("Send this from the hotel's website.", 400);
  const tenant = await getHotelTenantBySlug(slug);
  const site = tenant ? await getHotelSite(tenant.id) : null;
  if (!tenant || !site) return fail("Hotel not found.", 404);
  if (!site.published && "error" in (await requireHotelApiMember(slug))) return fail("Hotel not found.", 404);
  return { ok: true, ctx: { slug, tenant, site } };
}
