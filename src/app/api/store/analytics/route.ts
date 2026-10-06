import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { ANALYTICS_RANGES, getAnalyticsDetail, getAnalyticsSummary, rangeWindows, storeTimezone, type AnalyticsRange } from "@/lib/store/analytics";
import { featureUnavailable } from "@/lib/store/features";

/** GET /api/store/analytics?slug=&range=today|7d|28d — the store's analytics for the dashboard. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const resolved = await resolveStoreRequest(url.searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, service } = resolved;

  const blocked = await featureUnavailable(access.tenantId, "analytics");
  if (blocked) return blocked;

  const rangeParam = url.searchParams.get("range") || "7d";
  const range: AnalyticsRange = rangeParam in ANALYTICS_RANGES ? (rangeParam as AnalyticsRange) : "7d";

  const { data: profile } = await service.schema("store").from("business_profile").select("country_code, currency_code").eq("tenant_id", access.tenantId).maybeSingle();
  const timezone = storeTimezone(profile?.country_code);
  const { from, to, previousFrom, previousTo } = rangeWindows(range, timezone);

  try {
    const [current, previous, detail, sent] = await Promise.all([
      getAnalyticsSummary(access.tenantId, from, to),
      getAnalyticsSummary(access.tenantId, previousFrom, previousTo),
      getAnalyticsDetail(access.tenantId, from, to, timezone),
      service.schema("store").from("push_notifications").select("id, title, recipients, delivered, created_at").eq("tenant_id", access.tenantId).gte("created_at", from.toISOString()).order("created_at", { ascending: false }).limit(10),
    ]);

    const opensById = new Map(detail.notificationOpens.map((o) => [o.campaign, o.sessions]));
    const notifications = (sent.data || []).map((n) => ({
      id: n.id as string,
      title: n.title as string,
      sentAt: n.created_at as string,
      delivered: Number(n.delivered) || 0,
      opened: opensById.get(n.id as string) ?? 0,
    }));

    return NextResponse.json({
      range,
      timezone,
      currency: profile?.currency_code || "NGN",
      from: from.toISOString(),
      to: to.toISOString(),
      current,
      previous,
      ...detail,
      notifications,
    });
  } catch (error) {
    console.error("[store analytics] failed", error);
    return NextResponse.json({ error: "We couldn't load your analytics just now. Please try again." }, { status: 500 });
  }
}
