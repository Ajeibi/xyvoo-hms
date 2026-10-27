import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { postExtraNightsForTenant } from "@/lib/hms/folio-extra-nights";

/**
 * GET /api/cron/hms-extra-nights — run by Vercel Cron (see vercel.json) late each day. Charges
 * every hotel's overdue in-house stays for the nights they have run past departure, so bills
 * grow even if nobody opens the folio. Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createServerSupabaseClient();
    const { data: tenants, error } = await supabase
      .from("tenants")
      .select("id,pricing_setup")
      .eq("product", "hotel");
    if (error) throw new Error(error.message);

    let nights = 0;
    for (const tenant of tenants ?? []) {
      const r = await postExtraNightsForTenant(supabase, {
        tenantId: tenant.id as string,
        pricingSetup: tenant.pricing_setup,
        postedBy: null,
      });
      nights += r.nights;
    }
    return NextResponse.json({ ok: true, hotels: (tenants ?? []).length, nights });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Extra nights failed" }, { status: 500 });
  }
}
