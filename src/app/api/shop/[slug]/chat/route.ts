import { NextResponse } from "next/server";
import { STORE_PATHS } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { whatsappLink } from "@/lib/store/whatsapp";

/**
 * GET /api/shop/<store>/chat — where the "Chat with the shop" button on
 * XYVOO's WhatsApp order messages goes: the shop's own WhatsApp, or its
 * contact page (or home page) when it hasn't added a WhatsApp number.
 * The messages come from XYVOO's number, so this is how shoppers reach the shop itself.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL || "https://www.getxyvoo.com"));

  const chat = whatsappLink(storefront.profile.whatsapp, `Hello ${storefront.storeName}, I have a question about my order.`, storefront.profile.countryCode);
  if (chat) return NextResponse.redirect(chat);

  const contact = storefront.pages.find((p) => p.systemKey === "contact");
  return NextResponse.redirect(`${storefront.siteUrl}${contact ? STORE_PATHS.page(contact.slug) : ""}`);
}
