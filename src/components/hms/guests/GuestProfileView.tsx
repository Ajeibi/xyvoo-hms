import Link from "next/link";
import { ArrowLeft, BedDouble, Banknote, ConciergeBell, Heart, History, UserRound, Wallet } from "lucide-react";
import type { GuestProfileData } from "@/lib/hms/guest-profile";
import { formatGuestProfileRevenue } from "@/lib/hms/guest-profile";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { GuestDetailRows } from "@/components/hms/frontdesk/board/guest-details";
import { GuestFlagsAndNotes } from "@/components/hms/guests/GuestFlagsAndNotes";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile } from "@/components/hms/hms-ui";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

type Tone = "slate" | "green" | "amber" | "red" | "blue";

const STAY_TONE: Record<string, Tone> = {
  confirmed: "blue",
  checked_in: "green",
  checked_out: "slate",
  cancelled: "red",
  no_show: "amber",
};

const REQUEST_TONE: Record<string, Tone> = {
  open: "amber",
  new: "amber",
  pending: "amber",
  in_progress: "blue",
  assigned: "blue",
  completed: "green",
  resolved: "green",
  closed: "slate",
  cancelled: "slate",
};

const words = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Nothing() {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">None</span>
    </>
  );
}

export function GuestProfileView({
  slug,
  data,
  canEdit,
}: {
  slug: string;
  data: GuestProfileData;
  canEdit: boolean;
}) {
  const otherTags = data.guest.tags.filter((tag) => !["vip", "do_not_walk"].includes(tag.toLowerCase()));

  return (
    <HmsPage wide>
      <Link
        href={`/hms/${slug}/guests`}
        className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to guests
      </Link>

      <HmsPageHeader eyebrow="Guests" meaning="guests" title={data.guest.displayName} description="Their details, stays, bills and the notes your team has made." />

      <HmsCard
        id="guest-details"
        icon={UserRound}
        meaning="guests"
        title="Guest details"
        actions={
          data.isVip || data.isDoNotWalk || otherTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.isVip ? <HmsPill tone="amber">VIP</HmsPill> : null}
              {data.isDoNotWalk ? <HmsPill tone="red">Do not walk</HmsPill> : null}
              {otherTags.map((tag) => (
                <HmsPill key={tag}>{tag}</HmsPill>
              ))}
            </div>
          ) : undefined
        }
      >
        <dl>
          <GuestDetailRows guest={data.guest} />
        </dl>
      </HmsCard>

      <HmsStatStrip label="This guest in figures" columns={3}>
        <HmsStatTile label="Completed stays" value={data.visitCount} icon={BedDouble} meaning="rooms" hint="Stays they've checked out of" />
        <HmsStatTile
          label="Spent with you"
          value={formatGuestProfileRevenue(data.totalRevenue, data.currency)}
          icon={Banknote}
          meaning="money"
          hint="Across all their stays"
        />
        <HmsStatTile
          label="Still to pay"
          value={formatGuestProfileRevenue(data.openBalance, data.currency)}
          icon={Wallet}
          meaning="money"
          hint="An estimate of what's owed"
        />
      </HmsStatStrip>

      <GuestFlagsAndNotes
        slug={slug}
        guestId={data.guestId}
        isVip={data.isVip}
        isDoNotWalk={data.isDoNotWalk}
        notes={data.notes}
        canEdit={canEdit}
      />

      {data.preferences ? (
        <HmsCard id="guest-preferences" icon={Heart} meaning="guests" title="Preferences">
          <p className="text-sm text-slate-700">{data.preferences}</p>
        </HmsCard>
      ) : null}

      <HmsCard id="guest-stays" icon={History} meaning="rooms" title="Stays" description="Every booking linked to this guest." flush>
        {data.stays.length === 0 ? (
          <HmsEmptyState bare art="page" meaning="rooms" title="No stays yet" description="Bookings for this guest will be listed here." />
        ) : (
          <div className="thin-scrollbar overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="min-w-[720px] w-full border-collapse text-sm">
              <caption className="sr-only">Stays for {data.guest.displayName}</caption>
              <thead className="bg-slate-50 text-left text-sm text-slate-700">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Booking</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Status</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Room</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Arrival</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Departure</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 text-right font-semibold">Charges</th>
                </tr>
              </thead>
              <tbody>
                {data.stays.map((stay) => (
                  <tr key={stay.id} className="border-t border-slate-100 text-slate-700">
                    <td className="whitespace-nowrap px-6 py-3 font-medium text-slate-900">{stay.confirmationCode}</td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <HmsPill tone={STAY_TONE[stay.status] ?? "slate"}>{words(stay.status)}</HmsPill>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">{stay.roomCode ?? <Nothing />}</td>
                    <td className="whitespace-nowrap px-6 py-3">{formatBoardDateTime(stay.arrivalAt)}</td>
                    <td className="whitespace-nowrap px-6 py-3">{formatBoardDateTime(stay.departureAt)}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-slate-900">
                      {formatGuestProfileRevenue(stay.totalCharges, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

      {data.serviceRequests.length > 0 ? (
        <HmsCard
          id="guest-requests"
          icon={ConciergeBell}
          meaning="guests"
          title="Requests from this guest"
          description="Recent requests across their bookings."
          actions={
            <Link href={`/hms/${slug}/frontdesk/guest-services`} className={`rounded text-sm font-medium text-blue-700 hover:underline ${focusRing}`}>
              Open guest services
            </Link>
          }
          flush
        >
          <div className="thin-scrollbar overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="min-w-[640px] w-full border-collapse text-sm">
              <caption className="sr-only">Requests from {data.guest.displayName}</caption>
              <thead className="bg-slate-50 text-left text-sm text-slate-700">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Made</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Request</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Category</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Status</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Booking</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 text-right font-semibold">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.serviceRequests.map((svc) => (
                  <tr key={svc.id} className="border-t border-slate-100 text-slate-700">
                    <td className="whitespace-nowrap px-6 py-3">{formatBoardDateTime(svc.createdAt)}</td>
                    <td className="px-6 py-3 font-medium text-slate-900">{svc.requestType}</td>
                    <td className="px-6 py-3">{words(svc.serviceCategory)}</td>
                    <td className="px-6 py-3">
                      <HmsPill tone={REQUEST_TONE[svc.status] ?? "slate"}>{words(svc.status)}</HmsPill>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">{svc.confirmationCode ?? <Nothing />}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-right">
                      <Link
                        href={`/hms/${slug}/frontdesk/guest-services?q=${encodeURIComponent(svc.id)}`}
                        className={`rounded font-medium text-blue-700 hover:underline ${focusRing}`}
                      >
                        View<span className="sr-only"> request: {svc.requestType}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HmsCard>
      ) : null}
    </HmsPage>
  );
}
