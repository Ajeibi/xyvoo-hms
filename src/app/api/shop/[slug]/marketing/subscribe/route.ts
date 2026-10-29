import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { recordMarketingConsent } from "@/lib/store/campaigns-server";
import { isShopLive } from "@/lib/store/site/data";
import { issueMessage, requestT } from "@/lib/store/customer-api";
import { shopperT } from "@/lib/store/i18n/shopper";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().max(200).email("Check your email address."),
  name: z.string().trim().max(120).optional(),
});

/** POST /api/shop/<store>/marketing/subscribe { email, name? } — the newsletter sign-up on a shop. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (!(await rateLimitShared(`newsletter:${clientIp(req)}`, 10, 60 * 60_000)).ok) {
    return NextResponse.json({ error: (await requestT(req, slug))("errors.acTooManySignups") }, { status: 429 });
  }
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant || !(await isShopLive(tenant.id))) return NextResponse.json({ error: (await requestT(req, slug))("errors.acShopNotFound") }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: issueMessage(t, parsed.error.issues[0], "errors.acCheckEmail") }, { status: 400 });
  const saved = await recordMarketingConsent(tenant.id, parsed.data.email, parsed.data.name, "newsletter");
  if (!saved) return NextResponse.json({ error: t("errors.acSaveFailed") }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
