import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, BedDouble, Plane, Percent } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsStatStrip, HmsStatTile } from "@/components/hms/hms-ui";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadGuestPageContext } from "@/lib/hms/guest-page";
import { getAgentProfile } from "@/lib/hms/guest-companies";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

const words = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default async function AgentProfilePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await loadGuestPageContext(slug);
  if (!ctx) notFound();
  const agent = await getAgentProfile(createServerSupabaseClient(), ctx.tenant.id, id);
  if (!agent) notFound();
  const money = (n: number) => formatPricingAmount(n, ctx.currency);
  const detail = (label: string, value: string | null) => (
    <div className="flex flex-col gap-0.5 border-t border-slate-100 py-2 first:border-t-0 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-sm text-slate-600">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value || <span className="font-normal text-slate-500">Not set</span>}</dd>
    </div>
  );

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <HmsPage wide>
        <Link href={`/hms/${slug}/guests/agents`} className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to travel agents
        </Link>
        <GuestsNav slug={slug} />
        <HmsPageHeader eyebrow="Travel agents" meaning="guests" title={agent.name} description="Their details and every booking they sent." />

        <HmsStatStrip label="This agent in figures" columns={4}>
          <HmsStatTile label="Stays" value={agent.stays} icon={BedDouble} meaning="rooms" hint={`${agent.nights} nights · ${agent.cancelled} cancelled or no-show`} />
          <HmsStatTile label="Billed" value={money(agent.spend)} icon={Banknote} meaning="money" hint="From the bills" />
          <HmsStatTile label="Commission" value={money(agent.commission)} icon={Percent} meaning="money" hint="On rooms, at the agreed rate" />
          <HmsStatTile label="Usual rate" value={agent.commissionPercent != null ? `${agent.commissionPercent}%` : "—"} icon={Plane} meaning="guests" hint="Change it in Reservations settings" />
        </HmsStatStrip>

        <HmsCard id="agent-details" icon={Plane} meaning="guests" title="Agent details">
          <dl>
            {detail("Contact person", agent.contactName)}
            {detail("Phone", agent.phone)}
            {detail("Email", agent.email)}
            {detail("Address", [agent.address, agent.country].filter(Boolean).join(", "))}
            {detail("Payment terms", agent.paymentTerms)}
            {detail("Notes", agent.notes)}
          </dl>
        </HmsCard>

        <HmsCard id="agent-stays" icon={BedDouble} meaning="rooms" title="Bookings" description="The latest 50." flush>
          {agent.recent.length === 0 ? (
            <HmsEmptyState bare icon={BedDouble} meaning="rooms" title="No bookings yet" description="Bookings that name this agent appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-190 text-left text-sm">
                <caption className="sr-only">Bookings from {agent.name}</caption>
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th scope="col" className="py-3 pl-6 pr-4 font-semibold">Booking</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Guest</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Status</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Arrival</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Billed</th>
                    <th scope="col" className="py-3 pr-6 text-right font-semibold">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agent.recent.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap py-3 pl-6 pr-4 font-medium text-slate-900">{s.confirmationCode}</td>
                      <td className="py-3 pr-4">
                        {s.guestId ? (
                          <Link href={`/hms/${slug}/guests/${s.guestId}`} className="text-blue-700 hover:underline">
                            {s.guestName}
                          </Link>
                        ) : (
                          s.guestName
                        )}
                      </td>
                      <td className="py-3 pr-4">{words(s.status)}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-slate-700">{formatBoardDateTime(s.arrivalAt)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{money(s.billed)}</td>
                      <td className="py-3 pr-6 text-right tabular-nums">{s.commission != null ? money(s.commission) : "—"}</td>
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
