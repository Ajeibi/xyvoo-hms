import "@/lib/hms/alert-delivery-register";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBusinessDate, hotelLocalHour } from "@/lib/hms/business-date";
import { closeBusinessDay } from "@/lib/hms/night-audit-cycle";
import { sendAlert } from "@/lib/hms/alerts";

/** The most days one run closes, so a hotel that fell far behind catches up over a few runs. */
const MAX_DAYS_PER_RUN = 3;

/**
 * GET /api/cron/hms-night-audit — run hourly by Vercel Cron (see vercel.json). For every hotel that
 * switched on the automatic night audit, closes the business day once its hour has come at the
 * hotel, so the books and the end-of-day report don't wait for someone to remember. Warnings don't
 * stop it (they go in the report); a blocker does, and the owners are told. Vercel sends
 * "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServerSupabaseClient();
  const now = new Date();
  const totals = { hotels: 0, closed: 0, blocked: 0 };
  try {
    const { data: due, error } = await service.schema("hotel").from("night_audit_settings").select("tenant_id,auto_run_hour").eq("auto_run", true);
    if (error) throw new Error(error.message);

    for (const row of due ?? []) {
      const tenantId = row.tenant_id as string;
      try {
        const { data: tenant } = await service.from("tenants").select("id,product,subdomain").eq("id", tenantId).maybeSingle();
        if (!tenant || tenant.product !== "hotel") continue;
        totals.hotels += 1;

        let info = await getBusinessDate(service, tenantId, now);
        if (hotelLocalHour(now, info.timeZone) < (row.auto_run_hour as number)) continue;

        // Someone with the right to close the books stands in as the person who ran it.
        const { data: owner } = await service.schema("hotel").from("memberships").select("user_id").eq("tenant_id", tenantId).in("role", ["owner", "admin"]).order("created_at").limit(1).maybeSingle();
        if (!owner) continue;

        for (let i = 0; i < MAX_DAYS_PER_RUN && info.canAudit; i += 1) {
          const result = await closeBusinessDay(service, { tenantId, userId: owner.user_id as string, auditDate: info.businessDate, automatic: true, now });
          if (!result.ok) {
            totals.blocked += 1;
            await sendAlert({
              tenantId,
              type: "night_audit_failed",
              title: "Night audit couldn't run",
              body: `${info.businessDate} wasn't closed automatically: ${result.error}`,
              severity: "critical",
              entityType: "night_audit",
              entityId: tenantId,
              dedupeHours: 20,
            });
            break;
          }
          totals.closed += 1;
          info = await getBusinessDate(service, tenantId, now);
        }
      } catch (e) {
        console.warn("[hms-night-audit] hotel failed", tenantId, e);
      }
    }
    return NextResponse.json({ ok: true, ...totals });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Night audit run failed" }, { status: 500 });
  }
}
