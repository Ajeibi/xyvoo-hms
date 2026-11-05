import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runSyncForAll } from "@/lib/hms/accounting-sync/worker";

export const maxDuration = 60;

/**
 * GET /api/cron/hms-accounting-sync — daily retry worker for the Sage journal queue (Vercel Hobby runs
 * crons at most once a day; fresh postings also get an immediate best-effort attempt).
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runSyncForAll(createServerSupabaseClient())) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Accounting sync failed" }, { status: 500 });
  }
}
