import { NextResponse } from "next/server";
import { releaseExpiredOrders } from "@/lib/store/release-orders";

/**
 * GET /api/cron/release-orders — run by Vercel Cron (see vercel.json). Cancels
 * card orders that were never paid or whose payment failed, and puts their
 * stock back. Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, released: await releaseExpiredOrders() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Release failed" }, { status: 500 });
  }
}
