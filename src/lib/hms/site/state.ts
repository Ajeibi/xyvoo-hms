import { NextResponse } from "next/server";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { storefrontUrl } from "@/lib/store/subdomain";
import { missingForPublish } from "./readiness";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { addressChangesLeft, getHotelSite, listPreviousAddresses, type PreviousAddress } from "./site";
import { getWebConfig } from "./web-config";

/** What the HMS "Website" settings show and the routes behind them return. */
export type WebsiteState = {
  templateId: string | null;
  address: string | null;
  /** The live address, e.g. https://grand.getxyvoo.com. */
  url: string | null;
  published: boolean;
  reservationsEmail: string;
  /** Instant booking confirms at once; request-to-book sends the hotel a request to answer. */
  bookingMode: "instant" | "request";
  /** How a guest pays the deposit the hotel asks for. Shown in the booking and the confirmation email. */
  paymentNote: string;
  /** One reminder email to a visitor who typed their email and left. */
  abandonedReminders: boolean;
  /** What is still needed before it can be published. */
  missing: string[];
  previous: PreviousAddress[];
  changesLeft: number;
  /** Opens the unpublished site for staff. */
  previewPath: string;
};

export async function loadWebsiteState(tenant: { id: string; room_types?: unknown }, slug: string): Promise<WebsiteState> {
  const [site, previous, config] = await Promise.all([getHotelSite(tenant.id), listPreviousAddresses(tenant.id).catch(() => []), getWebConfig(createServerSupabaseClient(), tenant.id)]);
  return {
    bookingMode: config.bookingMode,
    paymentNote: config.paymentNote ?? "",
    abandonedReminders: config.abandonedReminders,
    templateId: site?.templateId ?? null,
    address: site?.address ?? null,
    url: site?.address ? storefrontUrl(site.address) : null,
    published: site?.published ?? false,
    reservationsEmail: site?.reservationsEmail ?? "",
    missing: missingForPublish({
      templateId: site?.templateId ?? null,
      address: site?.address ?? null,
      reservationsEmail: site?.reservationsEmail ?? null,
      roomTypes: normalizeRoomTypes(tenant.room_types),
    }),
    previous,
    changesLeft: addressChangesLeft(previous),
    previewPath: `/stay/${slug}/index.html?hspreview=1`,
  };
}

/** Owner or admin of this hotel, for the routes behind the Website settings. */
export async function requireWebsiteAdmin(slug: string) {
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  if (!isAdminLikeRole(auth.role)) return { response: NextResponse.json({ error: "Only an owner or admin can change the hotel website." }, { status: 403 }) };
  const meta = auth.user.user_metadata as { full_name?: unknown } | undefined;
  const actor = { userId: auth.user.id, name: (typeof meta?.full_name === "string" && meta.full_name) || auth.user.email || "Admin" };
  return { auth, actor };
}
