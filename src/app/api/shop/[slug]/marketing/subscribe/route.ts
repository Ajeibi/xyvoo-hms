import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { recordMarketingConsent } from "@/lib/store/campaigns-server";
import { isShopLive } from "@/lib/store/site/data";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().max(200).email("Check your email address."),
  name: z.string().trim().max(120).optional(),
});

/** POST /api/shop/<store>/marketing/subscribe { email, name? } — the newsletter sign-up on a shop. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await rateLimitShared(`newsletter:${clientIp(req)}`, 10, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many sign-ups from here. Please try again later." }, { status: 429 });
  }
  const slug = (await params).slug;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant || !(await isShopLive(tenant.id))) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check your email address." }, { status: 400 });
  const saved = await recordMarketingConsent(tenant.id, parsed.data.email, parsed.data.name, "newsletter");
  if (!saved) return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
