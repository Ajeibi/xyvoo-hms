import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plane } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadGuestPageContext } from "@/lib/hms/guest-page";
import { listAgents } from "@/lib/hms/guest-companies";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

export const metadata: Metadata = { title: "Travel agents" };

export default async function AgentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadGuestPageContext(slug);
  if (!ctx) notFound();
  const agents = await listAgents(createServerSupabaseClient(), ctx.tenant.id);
  const money = (n: number) => formatPricingAmount(n, ctx.currency);

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <HmsPage wide>
        <GuestsNav slug={slug} />
        <HmsPageHeader eyebrow="Guests" meaning="guests" title="Travel agents" description="The agents who send you guests, with their bookings and the commission they earn." />
        <HmsSectionIntro
          id="guest-agents"
          meaning="guests"
          art="people"
          title="See who sends you business"
          points={[
            "Agents are added and given a commission rate under Reservations settings. Name an agent on a booking and it shows here.",
            "Commission is worked out on the room only, at the rate agreed when the booking was made.",
          ]}
        />
        <HmsCard id="agents-list" icon={Plane} meaning="guests" title="Your agents" description={`${agents.length} on record.`} flush>
          {agents.length === 0 ? (
            <HmsEmptyState bare icon={Plane} meaning="guests" title="No travel agents yet" description="Add an agent under Reservations settings, then choose them when you check a guest in." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 text-left text-sm">
                <caption className="sr-only">Travel agents</caption>
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th scope="col" className="py-3 pl-6 pr-4 font-semibold">Agent</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Rate</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Stays</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Billed</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Commission</th>
                    <th scope="col" className="py-3 pr-6 font-semibold">Last stay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td className="py-3 pl-6 pr-4">
                        <Link href={`/hms/${slug}/guests/agents/${a.id}`} className="font-medium text-blue-700 hover:underline">
                          {a.name}
                        </Link>
                        <p className="text-xs text-slate-600">{a.contactName ?? a.email ?? a.phone ?? ""}</p>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">{a.commissionPercent != null ? `${a.commissionPercent}%` : "—"}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{a.stays}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{money(a.spend)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{money(a.commission)}</td>
                      <td className="whitespace-nowrap py-3 pr-6 text-slate-700">{a.lastStayAt ? formatBoardDateTime(a.lastStayAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HmsCard>
      </HmsPage>
    </HMSLayout>
  );
}
