import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateSuggestions } from "@/lib/hms/rates/suggestions";

/**
 * GET /api/cron/hms-rates: run daily by Vercel Cron (see vercel.json). Looks at rooms sold and recent
 * bookings in every hotel that has opened Revenue (has a rate plan) and refreshes its price
 * suggestions. It never changes a price: staff accept or dismiss each suggestion.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServerSupabaseClient();
  const { data: plans, error } = await service.schema("hotel").from("rate_plans").select("tenant_id").eq("is_default", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const totals = { hotels: 0, created: 0, failed: 0 };
  for (const row of plans ?? []) {
    try {
      const { data: tenant } = await service.from("tenants").select("id, room_types, pricing_setup").eq("id", row.tenant_id).maybeSingle();
      if (!tenant) continue;
      const r = await generateSuggestions(service, tenant, null);
      totals.hotels += 1;
      totals.created += r.created;
    } catch (e) {
      totals.failed += 1;
      console.warn("[hms-rates]", row.tenant_id, e);
    }
  }
  return NextResponse.json({ ok: true, ...totals });
}
