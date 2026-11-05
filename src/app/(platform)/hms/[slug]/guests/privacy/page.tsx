import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadGuestPageContext } from "@/lib/hms/guest-page";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";

export const metadata: Metadata = { title: "Guest privacy" };

export default async function GuestPrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadGuestPageContext(slug);
  if (!ctx) notFound();
  const db = createServerSupabaseClient().schema("hotel");
  const tenantId = ctx.tenant.id;

  const count = async (column: string) => {
    const { count: n } = await db.from("guests").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq(column, true);
    return n ?? 0;
  };
  const [email, sms, whatsapp, total, requests, withdrawn] = await Promise.all([
    count("marketing_email"),
    count("marketing_sms"),
    count("marketing_whatsapp"),
    db.from("guests").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).then((r) => r.count ?? 0),
    db.from("guest_data_requests").select("id,guest_id,guest_name,kind,note,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
    db.from("guest_consent_log").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("granted", false).then((r) => r.count ?? 0),
  ]);

  const rows = requests.data ?? [];

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <HmsPage wide>
        <GuestsNav slug={slug} />
        <HmsPageHeader
          eyebrow="Guests"
          meaning="care"
          title="Guest privacy"
          description="Who agreed to hear from you, and the requests guests have made about their data."
        />
        <HmsSectionIntro
          id="guest-privacy-page"
          meaning="care"
          title="Your duties under the NDPA"
          points={[
            "Only send offers and news to guests who said yes, on the channel they said yes to. Nothing is pre-ticked here.",
            "Every offer message should carry the guest's unsubscribe link, which you can copy from their profile.",
            "A guest may ask for a copy of their data or for it to be erased. Do both from their profile; each is recorded below.",
          ]}
        />

        <HmsStatStrip label="Marketing consent in figures" columns={4}>
          <HmsStatTile label="Agreed to email" value={email} icon={Mail} meaning="care" hint={`of ${total} guests`} />
          <HmsStatTile label="Agreed to SMS" value={sms} icon={Smartphone} meaning="care" hint={`of ${total} guests`} />
          <HmsStatTile label="Agreed to WhatsApp" value={whatsapp} icon={MessageCircle} meaning="care" hint={`of ${total} guests`} />
          <HmsStatTile label="Times someone stopped" value={withdrawn} icon={ShieldCheck} meaning="care" hint="Across all channels" />
        </HmsStatStrip>

        <HmsCard id="data-requests" icon={ShieldCheck} meaning="care" title="Data requests" description="Copies of a guest's data and erasures, newest first." flush>
          {rows.length === 0 ? (
            <HmsEmptyState bare icon={ShieldCheck} meaning="care" title="No requests yet" description="They will be listed here when you download or erase a guest's data from their profile." />
          ) : (
            <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {rows.map((r) => (
                <li key={r.id as string} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/hms/${slug}/guests/${r.guest_id}`} className="min-w-0 truncate font-semibold text-blue-700 hover:underline">
                      {(r.guest_name as string) || "Guest"}
                    </Link>
                    <HmsPill tone={r.kind === "erasure" ? "red" : "blue"}>{r.kind === "erasure" ? "Details erased" : "Copy of data given"}</HmsPill>
                  </div>
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="text-xs font-medium text-slate-600">When</span>
                    <br />
                    {formatBoardDateTime(r.created_at as string)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-130 text-left text-sm">
                <caption className="sr-only">Data requests</caption>
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th scope="col" className="py-3 pl-6 pr-4 font-semibold">When</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Guest</th>
                    <th scope="col" className="py-3 pr-6 font-semibold">Request</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id as string}>
                      <td className="whitespace-nowrap py-3 pl-6 pr-4 text-slate-700">{formatBoardDateTime(r.created_at as string)}</td>
                      <td className="py-3 pr-4">
                        <Link href={`/hms/${slug}/guests/${r.guest_id}`} className="font-medium text-blue-700 hover:underline">
                          {(r.guest_name as string) || "Guest"}
                        </Link>
                      </td>
                      <td className="py-3 pr-6">
                        <HmsPill tone={r.kind === "erasure" ? "red" : "blue"}>{r.kind === "erasure" ? "Details erased" : "Copy of data given"}</HmsPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </HmsCard>
      </HmsPage>
    </HMSLayout>
  );
}
