import { NextResponse } from "next/server";
import { refreshFxRates } from "@/lib/store/fx-rates";

/**
 * GET /api/cron/fx-rates — run daily by Vercel Cron (see vercel.json). Saves
 * the day's reference exchange rates for converting shop prices.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const updated = await refreshFxRates();
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Refresh failed" }, { status: 502 });
  }
}
