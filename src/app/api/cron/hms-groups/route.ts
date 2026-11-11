import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runGuestMatching } from "@/lib/hms/groups/group-guests";
import { sendGroupReportEmails } from "@/lib/hms/groups/group-report-email";

/**
 * GET /api/cron/hms-groups: run daily by Vercel Cron (see vercel.json). For every hotel group with
 * two or more hotels: links guests known at several hotels (when the group shares guest profiles)
 * and refreshes what other hotels may see of them, then emails the daily group report to members
 * who asked for it. Groups of one are skipped, so single hotels see no change.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServerSupabaseClient();
  const totals = { groups: 0, linked: 0, emails: 0, failed: 0 };

  const { data: links, error } = await service.schema("hotel").from("hotel_group_hotels").select("group_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.group_id as string, (counts.get(l.group_id as string) ?? 0) + 1);
  const groupIds = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (!groupIds.length) return NextResponse.json({ ok: true, ...totals });

  const { data: groups } = await service.schema("hotel").from("hotel_groups").select("id, name, slug, base_currency").in("id", groupIds);
  for (const g of groups ?? []) {
    totals.groups += 1;
    try {
      const matched = await runGuestMatching(service, g.id as string, null);
      totals.linked += matched.linked;
      totals.emails += await sendGroupReportEmails(service, { id: g.id as string, name: g.name as string, slug: g.slug as string, baseCurrency: (g.base_currency as string) || "NGN" });
    } catch (e) {
      totals.failed += 1;
      console.error("[cron hms-groups]", g.slug, e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ ok: true, ...totals });
}
