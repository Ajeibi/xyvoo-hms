import { NextResponse } from "next/server";
import { sendDueCartReminders } from "@/lib/store/cart-reminders";
import { sendDueStockAlerts } from "@/lib/store/stock-alerts";
import { sendUnsentGiftCards } from "@/lib/store/gift-cards";
import { processCampaigns } from "@/lib/store/campaigns-server";
import { expireLoyaltyPoints } from "@/lib/store/loyalty-server";

/**
 * GET /api/cron/cart-reminders — run by Vercel Cron (see vercel.json). Sends
 * any abandoned-cart reminders that are due, and back-in-stock alerts for
 * products that are available again. The same sweep also runs after
 * busy shop and dashboard requests (runCartRemindersIfDue), so reminders go out
 * close to on time between cron runs. Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, sent: await sendDueCartReminders(), stockAlerts: await sendDueStockAlerts(), giftCards: await sendUnsentGiftCards(), campaigns: await processCampaigns(), loyaltyExpired: await expireLoyaltyPoints() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reminders failed" }, { status: 500 });
  }
}
