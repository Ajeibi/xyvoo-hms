import type { SupabaseClient } from "@supabase/supabase-js";
import { badge, detailsPanel, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { computeFolioBalance, mapFolioLineRow } from "@/lib/hms/folio";
import { addDaysToDate } from "@/lib/hms/business-date";
import { parseRecipients } from "@/lib/hms/night-audit-settings";
import type { AuditCheck } from "@/lib/hms/night-audit-checks";
import type { NightAuditBreakdown } from "@/lib/hms/night-audit";

/*
 * The manager's end-of-day report: what the hotel did on the closed day. It is worked out once,
 * when the audit runs, and kept on the run, so it reads the same later whatever happens to the
 * bills afterwards. It is printed from the night audit screen and emailed to the owners and admins.
 */

export type AuditReport = {
  date: string;
  generatedAt: string;
  rooms: {
    total: number;
    sold: number;
    occupancyPercent: number;
    /** Average daily rate: room revenue for the day divided by rooms sold. */
    adr: number;
    /** Revenue per available room: room revenue divided by all rooms. */
    revpar: number;
    arrivals: number;
    departures: number;
    inHouseAtClose: number;
  };
  revenue: Pick<NightAuditBreakdown, "roomRevenue" | "fbRevenue" | "otherRevenue" | "unclassifiedRevenue" | "taxesCollected">;
  totalRevenue: number;
  payments: Pick<NightAuditBreakdown, "cashTotal" | "cardTotal" | "cityLedgerTotal" | "depositsApplied">;
  /** What in-house guests owe in total at close. */
  guestLedgerOutstanding: number;
  depositsHeld: number;
  noShows: { confirmationCode: string; keptDeposit: number; fee: number }[];
  exceptions: { title: string; count: number; severity: string }[];
  overrideReason: string | null;
  automatic: boolean;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Rooms sold, occupancy, ADR and RevPAR. Pure. */
export function roomStats(input: { totalRooms: number; roomsSold: number; roomRevenue: number }) {
  const { totalRooms, roomsSold, roomRevenue } = input;
  return {
    occupancyPercent: totalRooms > 0 ? round((roomsSold / totalRooms) * 100) : 0,
    adr: roomsSold > 0 ? round(roomRevenue / roomsSold) : 0,
    revpar: totalRooms > 0 ? round(roomRevenue / totalRooms) : 0,
  };
}

export async function buildAuditReport(
  service: SupabaseClient,
  params: {
    tenantId: string;
    auditDate: string;
    breakdown: NightAuditBreakdown;
    checks: AuditCheck[];
    noShows: AuditReport["noShows"];
    overrideReason: string | null;
    automatic: boolean;
  },
): Promise<AuditReport> {
  const { tenantId, auditDate, breakdown } = params;
  const dayStart = `${auditDate}T00:00:00Z`;
  const nextDay = `${addDaysToDate(auditDate, 1)}T00:00:00Z`;
  const res = () => service.schema("hotel").from("reservations");
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [totalRooms, sold, arrivals, departures, inHouse, inHouseStays, deposits] = await Promise.all([
    count(service.schema("hotel").from("room_units").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    // A room is sold for the night when a stay that checked in covers it: arrived by the end of the day, leaves after it starts.
    count(res().select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["checked_in", "checked_out"]).lt("arrival_at", nextDay).gte("departure_at", nextDay)),
    count(res().select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["checked_in", "checked_out"]).gte("arrival_at", dayStart).lt("arrival_at", nextDay)),
    count(res().select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "checked_out").gte("departure_at", dayStart).lt("departure_at", nextDay)),
    count(res().select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "checked_in")),
    res().select("id").eq("tenant_id", tenantId).eq("status", "checked_in").limit(500),
    service.schema("hotel").from("reservation_deposits").select("amount").eq("tenant_id", tenantId).eq("status", "held"),
  ]);

  let outstanding = 0;
  const ids = (inHouseStays.data ?? []).map((r) => r.id as string);
  for (let i = 0; i < ids.length; i += 100) {
    const { data: lines } = await service.schema("hotel").from("folio_transactions").select("*").eq("tenant_id", tenantId).in("reservation_id", ids.slice(i, i + 100));
    const byStay = new Map<string, ReturnType<typeof mapFolioLineRow>[]>();
    for (const l of lines ?? []) {
      const m = mapFolioLineRow(l as Record<string, unknown>);
      byStay.set(m.reservation_id, [...(byStay.get(m.reservation_id) ?? []), m]);
    }
    for (const stay of byStay.values()) outstanding += computeFolioBalance(stay).balance;
  }

  const stats = roomStats({ totalRooms, roomsSold: sold, roomRevenue: breakdown.roomRevenue });
  return {
    date: auditDate,
    generatedAt: new Date().toISOString(),
    rooms: { total: totalRooms, sold, ...stats, arrivals, departures, inHouseAtClose: inHouse },
    revenue: {
      roomRevenue: breakdown.roomRevenue,
      fbRevenue: breakdown.fbRevenue,
      otherRevenue: breakdown.otherRevenue,
      unclassifiedRevenue: breakdown.unclassifiedRevenue,
      taxesCollected: breakdown.taxesCollected,
    },
    totalRevenue: round(breakdown.roomRevenue + breakdown.fbRevenue + breakdown.otherRevenue + breakdown.unclassifiedRevenue),
    payments: { cashTotal: breakdown.cashTotal, cardTotal: breakdown.cardTotal, cityLedgerTotal: breakdown.cityLedgerTotal, depositsApplied: breakdown.depositsApplied },
    guestLedgerOutstanding: round(outstanding),
    depositsHeld: round((deposits.data ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0)),
    noShows: params.noShows,
    exceptions: params.checks.filter((c) => c.severity === "warning" || c.severity === "blocker").map((c) => ({ title: c.title, count: c.count, severity: c.severity })),
    overrideReason: params.overrideReason,
    automatic: params.automatic,
  };
}

const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Who gets the report: owners and admins, plus any extra addresses the hotel added. */
export async function reportRecipients(service: SupabaseClient, tenantId: string, extra: string): Promise<string[]> {
  const { data: members } = await service.schema("hotel").from("memberships").select("user_id").eq("tenant_id", tenantId).in("role", ["owner", "admin"]);
  const emails: string[] = [];
  for (const m of members ?? []) {
    const { data } = await service.auth.admin.getUserById(m.user_id as string);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return [...new Set([...emails.map((e) => e.toLowerCase()), ...parseRecipients(extra)])];
}

/** Emails the report to each address. Returns how many were sent. */
export async function emailAuditReport(service: SupabaseClient, params: { tenantId: string; report: AuditReport; extraRecipients: string }): Promise<number> {
  const { data: t } = await service.from("tenants").select("subdomain,name,display_name").eq("id", params.tenantId).maybeSingle();
  const slug = String(t?.subdomain || t?.name || "");
  const hotelName = (t?.display_name as string | null)?.trim() || slug;
  const r = params.report;
  const recipients = await reportRecipients(service, params.tenantId, params.extraRecipients);
  const link = `${EMAIL_SITE_URL}/hms/${slug}/accounts/night-audit`;
  const headline = `${r.rooms.sold} of ${r.rooms.total} rooms sold (${r.rooms.occupancyPercent}%), revenue ${money(r.totalRevenue)}.`;
  const attention = r.exceptions.length > 0;
  let sent = 0;
  for (const to of recipients) {
    try {
      await sendBrandedEmail({
        to,
        subject: `${hotelName} night audit · ${r.date}`,
        text: `${hotelName} night audit for ${r.date}\n${headline}\nADR ${money(r.rooms.adr)} · RevPAR ${money(r.rooms.revpar)}\nRoom ${money(r.revenue.roomRevenue)} · Food and drink ${money(r.revenue.fbRevenue)} · Other ${money(r.revenue.otherRevenue)}\nCash ${money(r.payments.cashTotal)} · Card ${money(r.payments.cardTotal)} · Company bills ${money(r.payments.cityLedgerTotal)}\nGuests owe ${money(r.guestLedgerOutstanding)} · Deposits held ${money(r.depositsHeld)}\n\nOpen: ${link}`,
        layout: {
          preheader: headline,
          badges: [badge(r.automatic ? "Ran automatically" : "Closed by staff", "green"), ...(attention ? [badge(`${r.exceptions.length} to look at`, "amber")] : [])],
          title: `${hotelName}: ${r.date} is closed`,
          intro: headline,
          body:
            detailsPanel([
              { label: "Rooms sold", value: `${r.rooms.sold} of ${r.rooms.total} (${r.rooms.occupancyPercent}%)` },
              { label: "Average daily rate", value: money(r.rooms.adr) },
              { label: "Revenue per available room", value: money(r.rooms.revpar) },
              { label: "Arrived / left / in house", value: `${r.rooms.arrivals} / ${r.rooms.departures} / ${r.rooms.inHouseAtClose}` },
              { label: "Room revenue", value: money(r.revenue.roomRevenue) },
              { label: "Food and drink", value: money(r.revenue.fbRevenue) },
              { label: "Other departments", value: money(r.revenue.otherRevenue + r.revenue.unclassifiedRevenue) },
              { label: "VAT and levies (not revenue)", value: money(r.revenue.taxesCollected) },
              { label: "Cash taken", value: money(r.payments.cashTotal) },
              { label: "Card and POS", value: money(r.payments.cardTotal) },
              { label: "Billed to companies", value: money(r.payments.cityLedgerTotal) },
              { label: "In-house guests owe", value: money(r.guestLedgerOutstanding) },
              { label: "Deposits held", value: money(r.depositsHeld) },
              { label: "No-shows", value: String(r.noShows.length) },
              ...(r.exceptions.length ? [{ label: "Left open", value: r.exceptions.map((e) => `${e.title} (${e.count})`).join(", ") }] : []),
              ...(r.overrideReason ? [{ label: "Reason given to go ahead", value: r.overrideReason }] : []),
            ]),
          buttons: [{ label: "Open the night audit", href: link }],
          footerNote: "You get this because you are an owner or admin of the hotel, or were added to the night audit report list.",
        },
      });
      sent += 1;
    } catch (e) {
      console.warn("[night-audit] report email failed", to, e);
    }
  }
  return sent;
}
