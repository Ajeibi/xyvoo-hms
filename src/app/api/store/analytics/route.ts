import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { getAnalyticsDetail, getAnalyticsSummary, storeTimezone, windowsFromParams } from "@/lib/store/analytics";
import { featureUnavailable, getStorePlan, storeHasFeature } from "@/lib/store/features";

/**
 * GET /api/store/analytics?slug=&range=today|7d|28d, or &from=YYYY-MM-DD&to=YYYY-MM-DD
 * (dates in the store's timezone, both included) — the store's analytics for the dashboard.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const resolved = await resolveStoreRequest(url.searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  // Sales figures are for the owner and admins, not staff.
  if (!resolved.capabilities.canViewReports) return NextResponse.json({ error: "Only the owner or an admin can see reports." }, { status: 403 });
  const { access, service } = resolved;

  const blocked = await featureUnavailable(access.tenantId, "analytics");
  if (blocked) return blocked;

  const { data: profile } = await service.schema("store").from("business_profile").select("country_code, currency_code").eq("tenant_id", access.tenantId).maybeSingle();
  const timezone = storeTimezone(profile?.country_code);
  const windows = windowsFromParams(url.searchParams, timezone);
  if ("error" in windows) return NextResponse.json({ error: windows.error }, { status: 400 });
  const { from, to, previousFrom, previousTo, range, days, fromDate, toDate } = windows;

  try {
    const [current, previous, detail, sent, plan] = await Promise.all([
      getAnalyticsSummary(access.tenantId, from, to),
      getAnalyticsSummary(access.tenantId, previousFrom, previousTo),
      getAnalyticsDetail(access.tenantId, from, to, timezone),
      service.schema("store").from("push_notifications").select("id, title, recipients, delivered, created_at").eq("tenant_id", access.tenantId).gte("created_at", from.toISOString()).order("created_at", { ascending: false }).limit(10),
      getStorePlan(access.tenantId),
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
      days,
      fromDate,
      toDate,
      canExport: storeHasFeature(plan, "exports"),
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
