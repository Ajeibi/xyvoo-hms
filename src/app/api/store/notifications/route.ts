import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { listShopProducts } from "@/lib/shop/products";
import { rateLimit } from "@/lib/rate-limit";
import {
  countPushSubscribers,
  getPushConfig,
  listSentNotifications,
  notificationsLeftToday,
  PUSH_BODY_MAX,
  PUSH_DAILY_LIMIT,
  PUSH_TITLE_MAX,
  pushMessageSchema,
  sendStoreNotification,
} from "@/lib/store/push";
import { getStoreSite } from "@/lib/store/site/data";
import { STORE_PATHS } from "@/lib/store/site/links";

// Sending to a large list can take a while.
export const maxDuration = 60;

/** GET /api/store/notifications?slug= — subscribers, history and where notifications can link to. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, service, capabilities } = resolved;

  const [subscribers, sent, site, collections, products] = await Promise.all([
    countPushSubscribers(access.tenantId).catch(() => 0),
    listSentNotifications(access.tenantId).catch(() => []),
    getStoreSite(access.tenantId),
    service.schema("store").from("collections").select("slug, name").eq("tenant_id", access.tenantId).eq("is_visible", true).order("sort_order"),
    listShopProducts(access.tenantId, { pageSize: 50 }).catch(() => ({ products: [] })),
  ]);

  const links = [
    { label: "Home page", path: STORE_PATHS.home },
    { label: "All products", path: STORE_PATHS.products },
    ...(collections.data || []).map((c) => ({ label: `Collection: ${c.name}`, path: STORE_PATHS.collection(c.slug) })),
    ...products.products.map((p) => ({ label: `Product: ${p.name}`, path: STORE_PATHS.product(p.slug || p.id) })),
  ];

  return NextResponse.json({
    configured: Boolean(getPushConfig()),
    live: site?.status === "live",
    canSend: capabilities.canManageSettings,
    subscribers,
    sent,
    leftToday: notificationsLeftToday(sent),
    limits: { perDay: PUSH_DAILY_LIMIT, title: PUSH_TITLE_MAX, body: PUSH_BODY_MAX },
    links,
  });
}

/** POST /api/store/notifications { slug, title, body, path } — owner or admin; the shop must be live. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;

  if (!capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can send notifications." }, { status: 403 });
  if (!getPushConfig()) return NextResponse.json({ error: "Notifications aren't switched on yet." }, { status: 503 });
  if (!rateLimit(`store-push-send:${access.tenantId}`, 5, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Please wait a while before sending another notification." }, { status: 429 });
  }

  const parsed = pushMessageSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "Check the notification.", field: issue?.path.join(".") }, { status: 400 });
  }

  const site = await getStoreSite(access.tenantId);
  if (site?.status !== "live") return NextResponse.json({ error: "Publish your shop before sending notifications." }, { status: 400 });

  if (notificationsLeftToday(await listSentNotifications(access.tenantId)) === 0) {
    return NextResponse.json(
      { error: `You can send ${PUSH_DAILY_LIMIT} notifications a day, so customers don't turn them off. Please try again tomorrow.` },
      { status: 429 },
    );
  }

  const result = await sendStoreNotification(access.tenantId, parsed.data, access.userId);
  return NextResponse.json(result);
}
