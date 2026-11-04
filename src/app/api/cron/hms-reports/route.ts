import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { hotelDate } from "@/lib/hms/reports/dates";
import { getReportTimeZone } from "@/lib/hms/reports/load";
import { mapSchedule, scheduleDue, SCHEDULE_COLUMNS } from "@/lib/hms/reports/schedule-rules";
import { sendScheduledReport } from "@/lib/hms/reports/schedules";

/**
 * GET /api/cron/hms-reports — run hourly by Vercel Cron (see vercel.json). Sends each scheduled report
 * that is due: its hotel-local hour has come, today fits its weekday or day of month, and it has not
 * gone out yet today. Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServerSupabaseClient();
  const now = new Date();
  const totals = { schedules: 0, sent: 0, emails: 0, failed: 0 };
  try {
    const { data: rows, error } = await service.schema("hotel").from("report_schedules").select(SCHEDULE_COLUMNS).eq("active", true);
    if (error) throw new Error(error.message);

    const zones = new Map<string, string>();
    for (const row of rows ?? []) {
      const schedule = mapSchedule(row);
      totals.schedules += 1;
      try {
        let zone = zones.get(schedule.tenantId);
        if (!zone) {
          zone = await getReportTimeZone(service, schedule.tenantId);
          zones.set(schedule.tenantId, zone);
        }
        if (!scheduleDue(schedule, now, zone)) continue;

        // Claim today's send first, so two overlapping runs can't both send it.
        const today = hotelDate(now, zone);
        const { data: claimed } = await service
          .schema("hotel")
          .from("report_schedules")
          .update({ last_sent_on: today })
          .eq("id", schedule.id)
          .or(`last_sent_on.is.null,last_sent_on.neq.${today}`)
          .select("id");
        if (!claimed?.length) continue;

        const { data: tenant } = await service.from("tenants").select("id,subdomain,name,display_name,pricing_setup").eq("id", schedule.tenantId).maybeSingle();
        if (!tenant) continue;
        try {
          const { sent } = await sendScheduledReport(
            service,
            schedule,
            {
              id: tenant.id as string,
              slug: tenant.subdomain as string,
              currency: normalizePricingSetup(tenant.pricing_setup).currency,
              hotelName: ((tenant.display_name as string | null)?.trim() || (tenant.name as string | null)?.trim() || (tenant.subdomain as string)),
            },
            now,
          );
          totals.sent += 1;
          totals.emails += sent;
          await service.schema("hotel").from("report_schedules").update({ last_sent_at: now.toISOString(), last_error: null }).eq("id", schedule.id);
        } catch (e) {
          totals.failed += 1;
          console.warn("[hms-reports] send failed", schedule.id, e);
          // Give today's slot back so the next hourly run tries again.
          await service
            .schema("hotel")
            .from("report_schedules")
            .update({ last_sent_on: schedule.lastSentOn, last_error: e instanceof Error ? e.message.slice(0, 300) : "Send failed" })
            .eq("id", schedule.id);
        }
      } catch (e) {
        totals.failed += 1;
        console.warn("[hms-reports] schedule failed", schedule.id, e);
      }
    }
    return NextResponse.json({ ok: true, ...totals });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Report run failed" }, { status: 500 });
  }
}
