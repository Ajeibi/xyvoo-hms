import "@/lib/hms/alert-delivery-register";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { releaseHeldDeliveries, getHotelTimeZone } from "@/lib/hms/alert-delivery";
import { sweepEscalations, sweepOverdueCheckouts, sweepSlaBreaches } from "@/lib/hms/alert-sweep";
import { sendDailySummary, summaryDue, localDate } from "@/lib/hms/daily-summary";

/**
 * GET /api/cron/hms-alerts — run hourly by Vercel Cron (see vercel.json). For every hotel it raises
 * the time-based alerts (stays past departure, guest requests past their SLA), escalates critical
 * alerts nobody has read, sends alerts held for quiet hours, and emails the daily summary to the
 * owners and admins whose hour has come. Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServerSupabaseClient();
  const now = new Date();
  const totals = { hotels: 0, overdue: 0, sla: 0, escalated: 0, summaries: 0, released: 0 };
  try {
    const { data: tenants, error } = await service.from("tenants").select("id").eq("product", "hotel");
    if (error) throw new Error(error.message);

    for (const t of tenants ?? []) {
      const tenantId = t.id as string;
      totals.hotels += 1;
      try {
        totals.overdue += await sweepOverdueCheckouts(service, tenantId, now);
        totals.sla += await sweepSlaBreaches(service, tenantId, now);
        totals.escalated += await sweepEscalations(service, tenantId, now);

        // Daily summary: owners and admins who asked for it and whose hour has come.
        const { data: settings } = await service
          .schema("hotel")
          .from("notification_user_settings")
          .select("user_id,summary_hour,summary_last_sent")
          .eq("tenant_id", tenantId)
          .eq("daily_summary", true);
        if (settings?.length) {
          const timeZone = await getHotelTimeZone(service, tenantId);
          const { data: members } = await service.schema("hotel").from("memberships").select("user_id,role").eq("tenant_id", tenantId).in("role", ["owner", "admin"]);
          const managers = new Set((members ?? []).map((m) => m.user_id as string));
          for (const s of settings) {
            const userId = s.user_id as string;
            if (!managers.has(userId)) continue;
            if (!summaryDue({ summaryHour: s.summary_hour as number, lastSent: (s.summary_last_sent as string | null) ?? null, now, timeZone })) continue;
            const { data: u } = await service.auth.admin.getUserById(userId);
            if (!u?.user?.email) continue;
            // Mark it first so a slow send can't go out twice if the cron overlaps.
            await service.schema("hotel").from("notification_user_settings").update({ summary_last_sent: localDate(now, timeZone) }).eq("tenant_id", tenantId).eq("user_id", userId);
            try {
              await sendDailySummary(service, tenantId, userId, u.user.email, now);
              totals.summaries += 1;
            } catch (e) {
              console.warn("[hms-alerts] summary failed", e);
              await service.schema("hotel").from("notification_user_settings").update({ summary_last_sent: null }).eq("tenant_id", tenantId).eq("user_id", userId);
            }
          }
        }
      } catch (e) {
        console.warn("[hms-alerts] hotel failed", tenantId, e);
      }
    }
    totals.released = await releaseHeldDeliveries(service, now);
    return NextResponse.json({ ok: true, ...totals });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Alert sweep failed" }, { status: 500 });
  }
}
