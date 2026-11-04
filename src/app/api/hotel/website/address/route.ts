import { NextResponse } from "next/server";
import { checkAddressAvailable } from "@/lib/address-namespace";
import { rateLimit } from "@/lib/rate-limit";
import { storefrontUrl, storeSubdomainSchema } from "@/lib/store/subdomain";
import { MAX_ADDRESS_CHANGES_PER_30_DAYS } from "@/lib/hms/site/constants";
import { addressChangesInLast30Days, changeSiteAddress, getHotelSite, listPreviousAddresses, logSiteActivity } from "@/lib/hms/site/site";
import { loadWebsiteState, requireWebsiteAdmin } from "@/lib/hms/site/state";

const host = (address: string | null) => (address ? storefrontUrl(address).replace(/^https?:\/\//, "") : null);

/** GET /api/hotel/website/address?slug=&address= — whether the hotel can use this address. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const result = await requireWebsiteAdmin(params.get("slug") || "");
  if ("response" in result) return result.response;

  const parsed = storeSubdomainSchema.safeParse(params.get("address") || "");
  if (!parsed.success) return NextResponse.json({ available: false, reason: parsed.error.issues[0]?.message || "Check the web address." });
  const check = await checkAddressAvailable(parsed.data, result.auth.tenant.id);
  return NextResponse.json(check.available ? { available: true } : { available: false, reason: check.reason });
}

/**
 * POST /api/hotel/website/address { slug, address } — owner or admin. Moves the website to a new
 * address; the old one redirects there for 90 days.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const result = await requireWebsiteAdmin(slug);
  if ("response" in result) return result.response;
  const { auth, actor } = result;

  if (!rateLimit(`hotel-website-address:${auth.user.id}`, 10, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Too many attempts. Please try again in an hour." }, { status: 429 });
  }

  const parsed = storeSubdomainSchema.safeParse(typeof body?.address === "string" ? body.address.trim().toLowerCase() : "");
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the web address." }, { status: 400 });
  const address = parsed.data;

  try {
    const site = await getHotelSite(auth.tenant.id);
    if (!site) return NextResponse.json({ error: "Choose a template first." }, { status: 400 });
    if (address === site.address) return NextResponse.json({ error: "That's already your web address." }, { status: 400 });

    // The first address a hotel picks isn't a change: there is no old address to redirect.
    if (site.address) {
      const previous = await listPreviousAddresses(auth.tenant.id);
      if (addressChangesInLast30Days(previous) >= MAX_ADDRESS_CHANGES_PER_30_DAYS) {
        return NextResponse.json(
          { error: `You can change your web address ${MAX_ADDRESS_CHANGES_PER_30_DAYS} times in 30 days. Please try again later, or contact us if you need help.` },
          { status: 400 },
        );
      }
    }

    const check = await checkAddressAvailable(address, auth.tenant.id);
    if (!check.available) return NextResponse.json({ error: check.reason }, { status: 409 });

    await changeSiteAddress(auth.tenant.id, site.address, address);
    await logSiteActivity({ tenantId: auth.tenant.id, actor, action: "updated", changes: { web_address: { from: host(site.address), to: host(address) } } });
    return NextResponse.json(await loadWebsiteState(auth.tenant, slug));
  } catch (error) {
    console.error("[hotel website address POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to change the web address." }, { status: 500 });
  }
}
