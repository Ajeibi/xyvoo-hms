import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, Globe, MailX, MousePointerClick, Search } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile, hmsButton } from "@/components/hms/hms-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { formatPricingAmount, normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { loadWebFunnel } from "@/lib/hms/site/web-config";
import { listWebAbandoned, listWebBookings, listWebRequests } from "@/lib/hms/site/web-bookings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Website bookings" };

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

export default async function WebBookingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const back = (
    <Link href={`/hms/${slug}/reservations`} className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to reservations
    </Link>
  );
  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="reservations">
        <HmsPage>
          {back}
          <HmsEmptyState art="page" meaning="rooms" title="We couldn't find this hotel" description="Check the web address, or go back to your dashboard and try again." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const db = createServerSupabaseClient();
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;
  const roomName = new Map(normalizeRoomTypes(tenant.room_types).map((t) => [t.id, t.name]));
  const [funnel, bookings, requests, abandoned] = await Promise.all([loadWebFunnel(db, tenant.id, 30), listWebBookings(db, tenant.id), listWebRequests(db, tenant.id), listWebAbandoned(db, tenant.id)]);
  const rate = funnel.searches > 0 ? Math.round((funnel.booked / funnel.searches) * 1000) / 10 : null;
  const live = bookings.filter((b) => b.status !== "cancelled");
  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <HmsPage>
        {back}
        <HmsPageHeader
          eyebrow="Reservations"
          meaning="rooms"
          title="Website bookings"
          description="Bookings guests made on your website, requests waiting for your reply, and visitors who started and left. Change how online booking works under Settings, Website."
          actions={
            <Link href={`/hms/${slug}/settings#website-setup`} className={hmsButton.secondary}>
              Online booking settings
            </Link>
          }
        />

        <HmsStatStrip label="Last 30 days">
          <HmsStatTile label="Visits that checked prices" value={funnel.searches} hint={funnel.soldOut ? `${funnel.soldOut} found everything sold out` : "Last 30 days"} icon={Search} meaning="rooms" />
          <HmsStatTile label="Left their email" value={funnel.started} hint="Started a booking" icon={MousePointerClick} meaning="neutral" />
          <HmsStatTile label="Booked" value={funnel.booked} hint={rate === null ? "No visits yet" : `${rate}% of visits that checked prices`} icon={CalendarCheck} meaning="rooms" />
          <HmsStatTile label="Left without booking" value={funnel.abandoned + funnel.reminded} hint={`${funnel.reminded} reminded by email`} icon={MailX} meaning="neutral" status={funnel.abandoned > 0 ? "warning" : undefined} statusText="Reminder due" />
        </HmsStatStrip>

        <HmsCard title="Bookings from your website" description={`${live.length} on the books. Each is a confirmed reservation; open it for the guest, the deposit and the bill.`} icon={Globe} meaning="rooms">
          {bookings.length === 0 ? (
            <p className="text-sm text-slate-600">No guest has booked on your website yet. When they do, the booking appears here and on your Reservations list.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Booking</th>
                    <th className="py-2 pr-3">Guest</th>
                    <th className="py-2 pr-3">Room</th>
                    <th className="py-2 pr-3">Stay</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3">Deposit</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2 pr-3">
                        <Link href={`/hms/${slug}/reservations/${b.id}`} className="font-medium text-blue-700 underline">
                          {b.code}
                        </Link>
                        <div className="text-xs text-slate-500">{when(b.createdAt)}</div>
                      </td>
                      <td className="py-2 pr-3">
                        {b.guest}
                        <div className="text-xs text-slate-500">{b.email}</div>
                      </td>
                      <td className="py-2 pr-3">{roomName.get(b.roomTypeCode) ?? b.roomTypeCode}</td>
                      <td className="py-2 pr-3">
                        {day(b.checkIn)} to {day(b.checkOut)}
                        <div className="text-xs text-slate-500">{b.nights} night{b.nights === 1 ? "" : "s"}</div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatPricingAmount(b.total, currency)}</td>
                      <td className="py-2 pr-3">
                        {b.depositRequired > 0 ? (
                          <HmsPill tone={b.depositPaid + 0.005 >= b.depositRequired ? "green" : "amber"}>
                            {b.depositPaid + 0.005 >= b.depositRequired ? "Paid" : `${formatPricingAmount(b.depositPaid, currency)} of ${formatPricingAmount(b.depositRequired, currency)}`}
                          </HmsPill>
                        ) : (
                          <span className="text-slate-500">None asked</span>
                        )}
                      </td>
                      <td className="py-2">{b.status === "cancelled" ? (b.cancelledByGuest ? "Cancelled by guest" : "Cancelled") : b.status === "checked_in" ? "In house" : b.status === "confirmed" ? "Confirmed" : b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HmsCard>

        {requests.length > 0 ? (
          <HmsCard title="Booking requests" description={`${pendingRequests.length} waiting. These came in while online booking was set to “Request to book”, or before instant booking. Reply to the guest, then make the booking from New reservation.`} meaning="neutral">
            <ul className="divide-y divide-slate-100 text-sm">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{r.reference}</span> · {r.guest} · {r.room} · {day(r.checkIn)} to {day(r.checkOut)}
                    <span className="block text-xs text-slate-500">
                      {r.email} · {r.phone} · {when(r.createdAt)}
                    </span>
                  </span>
                  <HmsPill tone={r.status === "pending" ? "amber" : "slate"}>{r.status === "pending" ? "Waiting" : r.status}</HmsPill>
                </li>
              ))}
            </ul>
          </HmsCard>
        ) : null}

        <HmsCard title="Started and left" description="Visitors who typed their email on the booking page and didn't finish. They get one reminder the next morning, and nothing after that." meaning="neutral">
          {abandoned.length === 0 ? (
            <p className="text-sm text-slate-600">Nobody yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {abandoned.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    {a.firstName ? `${a.firstName} · ` : ""}
                    {a.email}
                    <span className="block text-xs text-slate-500">
                      {a.checkIn && a.checkOut ? `${day(a.checkIn)} to ${day(a.checkOut)}` : "No dates"}
                      {a.roomType ? ` · ${roomName.get(a.roomType) ?? a.roomType}` : ""} · started {when(a.startedAt)}
                    </span>
                  </span>
                  <HmsPill tone={a.status === "reminded" ? "blue" : a.status === "expired" ? "slate" : "amber"}>{a.status === "reminded" ? `Reminded ${a.remindedAt ? when(a.remindedAt) : ""}` : a.status === "expired" ? "Closed" : "Not reminded yet"}</HmsPill>
                </li>
              ))}
            </ul>
          )}
        </HmsCard>
      </HmsPage>
    </HMSLayout>
  );
}
