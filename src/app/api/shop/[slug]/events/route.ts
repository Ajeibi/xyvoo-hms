import { after, NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { eventBatchSchema, ingestEvents, isBot } from "@/lib/store/analytics";
import { getStoreSite } from "@/lib/store/site/data";
import { runCartRemindersIfDue } from "@/lib/store/cart-reminders";
import { runStockAlertsIfDue } from "@/lib/store/stock-alerts";
import { runGiftCardEmailsIfDue } from "@/lib/store/gift-cards";
import { runCampaignsIfDue } from "@/lib/store/campaigns-server";

/**
 * POST /api/shop/<store>/events — analytics events from a store page, sent only
 * after the visitor accepted analytics cookies. Sent with navigator.sendBeacon,
 * so the body arrives as text. Always answers 204 so failures never surface to
 * shoppers; nothing is stored for bots, unknown or unpublished stores.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const done = new NextResponse(null, { status: 204 });
  const userAgent = req.headers.get("user-agent");
  if (isBot(userAgent)) return done;
  if (!rateLimit(`store-events:${clientIp(req)}`, 120, 60_000).ok) return done;

  const slug = (await params).slug;
  if (!/^[a-z0-9-]{1,63}$/i.test(slug)) return done;

  const text = await req.text().catch(() => "");
  if (!text || text.length > 20_000) return done;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return done;
  }
  const parsed = eventBatchSchema.safeParse(json);
  if (!parsed.success) return done;

  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return done;
  const site = await getStoreSite(tenant.id);
  if (site?.status !== "live") return done;

  try {
    await ingestEvents(tenant.id, parsed.data, {
      userAgent,
      country: req.headers.get("x-vercel-ip-country"),
      host: req.headers.get("host"),
    });
  } catch (error) {
    console.error("[store events] not saved", error);
  }
  // Shop traffic keeps basket reminders on time between cron runs (at most every ten minutes).
  after(runCartRemindersIfDue);
  after(runStockAlertsIfDue);
  after(runGiftCardEmailsIfDue);
  after(runCampaignsIfDue);
  return done;
}
