import type { SupabaseClient } from "@supabase/supabase-js";
import { badge, detailsPanel, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { formatMoney } from "@/lib/hms/reports/model";
import { loadGroupFigures } from "./group-dashboard";
import type { GroupHotel } from "./group-types";

/*
 * The daily group email: yesterday-and-month-to-date across the group, to group members who ticked
 * "Daily report email". Sent by the nightly group job (system work with the service key; each
 * recipient holds a role in the group, so they may see every hotel's figures anyway).
 */

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

export async function sendGroupReportEmails(service: SupabaseClient, group: { id: string; name: string; slug: string; baseCurrency: string }) {
  const { data: recipients } = await service.schema("hotel").from("hotel_group_members").select("user_id").eq("group_id", group.id).eq("receives_reports", true);
  if (!recipients?.length) return 0;

  const { data: hotelRows } = await service.schema("hotel").from("hotel_group_hotels").select("tenant_id, joined_at").eq("group_id", group.id);
  const ids = (hotelRows ?? []).map((h) => h.tenant_id as string);
  if (ids.length < 2) return 0;
  const { data: tenants } = await service.from("tenants").select("id, subdomain, name, display_name, logo_url").in("id", ids);
  const hotels: GroupHotel[] = (tenants ?? []).map((t) => ({
    tenantId: t.id as string,
    slug: (t.subdomain as string) || (t.name as string),
    name: ((t.display_name as string) || (t.name as string) || (t.subdomain as string)).trim(),
    logoUrl: (t.logo_url as string) || null,
    currency: group.baseCurrency,
    joinedAt: (hotelRows ?? []).find((h) => h.tenant_id === t.id)?.joined_at as string,
  }));

  const figures = await loadGroupFigures(service, hotels);
  const cur = group.baseCurrency;
  const p = figures.totalPeriod;
  const headline = `${figures.totalStatus.inHouse} of ${figures.totalStatus.roomCount} rooms in house; ${formatMoney(p.totalRevenue, cur)} month to date.`;
  const link = `${EMAIL_SITE_URL}/hms-group/${group.slug}/dashboard`;
  const rows = figures.hotels.map((h) => ({
    label: h.hotel.name,
    value: h.ok && h.period && h.status ? `${h.status.inHouse}/${h.status.roomCount} in house · MTD ${pct(h.period.occupancy)} occupancy · ${formatMoney(h.period.totalRevenue, cur)}` : "Figures unavailable",
  }));

  let sent = 0;
  for (const r of recipients) {
    try {
      const { data } = await service.auth.admin.getUserById(r.user_id as string);
      const to = data.user?.email;
      if (!to) continue;
      await sendBrandedEmail({
        to,
        subject: `${group.name} today · ${figures.hotels[0]?.today ?? ""}`,
        text: `${group.name}\n${headline}\n\n${rows.map((x) => `${x.label}: ${x.value}`).join("\n")}\n\nGroup occupancy MTD ${pct(p.occupancy)}, ADR ${p.adr == null ? "—" : formatMoney(p.adr, cur)}, RevPAR ${p.revpar == null ? "—" : formatMoney(p.revpar, cur)}.\n\nOpen: ${link}`,
        layout: {
          preheader: headline,
          badges: [badge("Hotel group", "blue")],
          title: `${group.name} today`,
          intro: headline,
          body: detailsPanel([
            ...rows,
            { label: "Group occupancy, month to date", value: pct(p.occupancy) },
            { label: "Group ADR, month to date", value: p.adr == null ? "—" : formatMoney(p.adr, cur) },
            { label: "Group RevPAR, month to date", value: p.revpar == null ? "—" : formatMoney(p.revpar, cur) },
          ]),
          buttons: [{ label: "Open the group overview", href: link }],
          footerNote: "You get this because the group owner ticked 'Daily report email' for you in the group's Settings.",
        },
      });
      sent += 1;
    } catch (e) {
      console.error("[group-report-email]", group.slug, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
