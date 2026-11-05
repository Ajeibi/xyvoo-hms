import { NextResponse } from "next/server";
import { sendAbandonedReminder } from "@/lib/hms/site/web-emails";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { storefrontUrl } from "@/lib/store/subdomain";

/**
 * GET /api/cron/hms-web-reminders: run daily by Vercel Cron (see vercel.json). A visitor who typed
 * their email on a hotel's booking page and left more than two hours ago, and has not booked since,
 * gets one reminder with their stay filled in. Visitors whose dates have passed, or who are older
 * than a week, are closed without an email. Hotels can switch reminders off.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServerSupabaseClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const totals = { sent: 0, expired: 0, skipped: 0, failed: 0 };

  // Old ones close quietly.
  const { data: stale } = await db.schema("hotel").from("website_booking_sessions").update({ status: "expired" }).eq("status", "started").lt("updated_at", weekAgo).select("id");
  totals.expired += stale?.length ?? 0;

  const { data: sessions, error } = await db
    .schema("hotel")
    .from("website_booking_sessions")
    .select("id,tenant_id,email,first_name,check_in,check_out,adults,children,rooms,room_type,rate_plan,created_at")
    .eq("status", "started")
    .not("email", "is", null)
    .lt("updated_at", twoHoursAgo)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const s of sessions ?? []) {
    try {
      if (s.check_in && (s.check_in as string) < today) {
        await db.schema("hotel").from("website_booking_sessions").update({ status: "expired" }).eq("id", s.id);
        totals.expired += 1;
        continue;
      }
      const { data: site } = await db.schema("hotel").from("sites").select("address,published,reservations_email,abandoned_reminders").eq("tenant_id", s.tenant_id).maybeSingle();
      if (!site?.published || !site.address || site.abandoned_reminders === false) {
        totals.skipped += 1;
        continue;
      }
      // Booked in some other visit since? Then there is nothing to remind them of.
      const { data: guests } = await db.schema("hotel").from("guests").select("id").eq("tenant_id", s.tenant_id).ilike("email", s.email as string).limit(5);
      if (guests?.length) {
        const { data: links } = await db.schema("hotel").from("reservation_guests").select("reservation_id").in("guest_id", guests.map((g) => g.id as string)).limit(50);
        if (links?.length) {
          const { count } = await db
            .schema("hotel")
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", s.tenant_id)
            .in("id", links.map((l) => l.reservation_id as string))
            .eq("source", "website")
            .gte("created_at", s.created_at as string);
          if ((count ?? 0) > 0) {
            await db.schema("hotel").from("website_booking_sessions").update({ status: "booked" }).eq("id", s.id);
            totals.skipped += 1;
            continue;
          }
        }
      }
      // Claim it before sending, so a second run can't send it again.
      const { data: claimed } = await db
        .schema("hotel")
        .from("website_booking_sessions")
        .update({ status: "reminded", reminder_sent_at: new Date().toISOString() })
        .eq("id", s.id)
        .eq("status", "started")
        .select("id");
      if (!claimed?.length) continue;

      const { data: tenant } = await db.from("tenants").select("name,display_name").eq("id", s.tenant_id).maybeSingle();
      const q = new URLSearchParams();
      if (s.check_in && s.check_out) {
        q.set("checkin", s.check_in as string);
        q.set("checkout", s.check_out as string);
      }
      if (s.adults) q.set("adults", String(s.adults));
      if (s.children) q.set("children", String(s.children));
      if (s.rooms) q.set("rooms", String(s.rooms));
      if (s.room_type) q.set("room", s.room_type as string);
      await sendAbandonedReminder({
        to: s.email as string,
        firstName: (s.first_name as string | null) ?? null,
        hotelName: (tenant?.display_name as string) || (tenant?.name as string) || "the hotel",
        checkIn: (s.check_in as string | null) ?? null,
        checkOut: (s.check_out as string | null) ?? null,
        resumeUrl: `${storefrontUrl(site.address as string)}/book.html${q.size ? `?${q}` : ""}`,
        replyTo: (site.reservations_email as string | null) ?? null,
      });
      totals.sent += 1;
    } catch (e) {
      totals.failed += 1;
      console.warn("[hms-web-reminders]", s.id, e);
    }
  }
  return NextResponse.json({ ok: true, ...totals });
}
