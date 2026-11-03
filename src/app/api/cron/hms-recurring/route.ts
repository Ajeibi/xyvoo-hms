import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runDueRecurring } from "@/lib/hms/recurring-entries";

/**
 * GET /api/cron/hms-recurring — run by Vercel Cron (see vercel.json) each morning. Posts every
 * hotel's recurring journals and bills that have come due. A month already posted is never posted
 * again. Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createServerSupabaseClient();
    const { data: tenants, error } = await supabase.from("tenants").select("id").eq("product", "hotel");
    if (error) throw new Error(error.message);

    const today = new Date().toISOString().slice(0, 10);
    let posted = 0;
    let failed = 0;
    for (const tenant of tenants ?? []) {
      const r = await runDueRecurring(supabase, { tenantId: tenant.id as string, today });
      posted += r.posted;
      failed += r.failed.length;
    }
    return NextResponse.json({ ok: true, hotels: (tenants ?? []).length, posted, failed });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Recurring run failed" }, { status: 500 });
  }
}
