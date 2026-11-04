import Link from "next/link";
import { ArrowLeft, BedDouble, Banknote, CalendarClock, ConciergeBell, Heart, History, Moon, Wallet } from "lucide-react";
import type { GuestProfileData } from "@/lib/hms/guest-profile";
import { formatGuestProfileRevenue } from "@/lib/hms/guest-profile";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { GuestDetailsCard } from "@/components/hms/guests/GuestDetailsCard";
import { GuestFlagsAndNotes } from "@/components/hms/guests/GuestFlagsAndNotes";
import { GuestFeedbackCard } from "@/components/hms/guests/GuestFeedbackCard";
import { GuestLoyaltyCard } from "@/components/hms/guests/GuestLoyaltyCard";
import { GuestPrivacyCard } from "@/components/hms/guests/GuestPrivacyCard";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile } from "@/components/hms/hms-ui";
import type { CompanyOption } from "@/lib/hms/guest-fields";
import type { ConsentLogEntry, ConsentState } from "@/lib/hms/guest-consent-shared";
import type { GuestLoyalty, LoyaltySettings } from "@/lib/hms/guest-loyalty-shared";

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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export function GuestProfileView({
  slug,
  data,
  canEdit,
  canManage,
  companies,
  consent,
  unsubscribeUrl,
  loyaltySettings,
  loyalty,
  pointValueLabel,
}: {
  slug: string;
  data: GuestProfileData;
  canEdit: boolean;
  canManage: boolean;
  companies: CompanyOption[];
  consent: { state: ConsentState; updatedAt: string | null; log: ConsentLogEntry[] };
  unsubscribeUrl: string;
  loyaltySettings: LoyaltySettings;
  loyalty: GuestLoyalty;
  pointValueLabel: string;
}) {
  const otherTags = data.guest.tags.filter((tag) => !["vip", "do_not_walk"].includes(tag.toLowerCase()));
  const m = data.metrics;
  const money = (n: number) => formatGuestProfileRevenue(n, data.currency);

  return (
    <HmsPage wide>
      <Link
        href={`/hms/${slug}/guests`}
        className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to guests
      </Link>

      <GuestsNav slug={slug} />

      <HmsPageHeader eyebrow="Guests" meaning="guests" title={data.guest.displayName} description="Their details, stays, bills and the notes your team has made." />

      <GuestDetailsCard
        slug={slug}
        guestId={data.guestId}
        guest={data.guest}
        editable={data.editable}
        companies={companies}
        companyName={data.companyName}
        companyId={data.companyId}
        address={data.address}
        language={data.language}
        tags={otherTags}
        isVip={data.isVip}
        isDoNotWalk={data.isDoNotWalk}
        canEdit={canEdit}
        anonymised={data.anonymised}
      />

      <HmsStatStrip label="This guest in figures" columns={4}>
        <HmsStatTile
          label="Completed stays"
          value={m.completedStays}
          icon={BedDouble}
          meaning="rooms"
          hint={m.upcomingStays > 0 ? `${m.upcomingStays} coming up` : "Stays they've checked out of"}
        />
        <HmsStatTile
          label="Nights stayed"
          value={m.nights}
          icon={Moon}
          meaning="rooms"
          hint={m.staysStarted > 0 ? `${(m.nights / m.staysStarted).toFixed(1)} nights a stay` : "Across all their stays"}
        />
        <HmsStatTile label="Spent with you" value={money(data.totalRevenue)} icon={Banknote} meaning="money" hint="What their bills came to" />
        <HmsStatTile label="Still to pay" value={money(data.openBalance)} icon={Wallet} meaning="money" hint="An estimate of what's owed" />
      </HmsStatStrip>

      {m.staysStarted > 0 ? (
        <HmsCard id="guest-spend" icon={CalendarClock} meaning="money" title="Spend and habits" description="Worked out from their bills, not just the room price.">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Average per stay">{money(m.spend / m.staysStarted)}</Fact>
            <Fact label="Average room rate a night">{money(m.nights > 0 ? m.roomSpend / m.nights : 0)}</Fact>
            <Fact label="Usual room type">{m.favouriteRoomType ?? <Nothing />}</Fact>
            <Fact label="Rooms">{money(m.roomSpend)}</Fact>
            <Fact label="Food and drink">{money(m.foodBeverageSpend)}</Fact>
            <Fact label="Everything else">{money(m.otherSpend)}</Fact>
            <Fact label="First stay">{m.firstStayAt ? formatBoardDateTime(m.firstStayAt) : <Nothing />}</Fact>
            <Fact label="Last stay">{m.lastStayAt ? formatBoardDateTime(m.lastStayAt) : <Nothing />}</Fact>
            <Fact label="Cancelled / no-shows">
              {m.cancelled} / {m.noShows}
            </Fact>
          </dl>
        </HmsCard>
      ) : null}

      <GuestFlagsAndNotes
        slug={slug}
        guestId={data.guestId}
        isVip={data.isVip}
        isDoNotWalk={data.isDoNotWalk}
        notes={data.notes}
        canEdit={canEdit}
      />

      <GuestLoyaltyCard slug={slug} guestId={data.guestId} settings={loyaltySettings} loyalty={loyalty} canManage={canManage} currencyLabel={pointValueLabel} />

      <GuestPrivacyCard
        slug={slug}
        guestId={data.guestId}
        guestName={data.guest.displayName}
        state={consent.state}
        updatedAt={consent.updatedAt}
        log={consent.log}
        unsubscribeUrl={unsubscribeUrl}
        canEdit={canEdit}
        canManage={canManage}
        anonymised={data.anonymised}
      />

      <GuestFeedbackCard slug={slug} guestId={data.guestId} />

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
            <table className="min-w-[960px] w-full border-collapse text-sm">
              <caption className="sr-only">Stays for {data.guest.displayName}</caption>
              <thead className="bg-slate-50 text-left text-sm text-slate-700">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Booking</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Status</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Room</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 text-right font-semibold">Nights</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Booked through</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Arrival</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 font-semibold">Departure</th>
                  <th scope="col" className="whitespace-nowrap px-6 py-3 text-right font-semibold">Billed</th>
                </tr>
              </thead>
              <tbody>
                {data.stays.map((stay) => (
                  <tr key={stay.id} className="border-t border-slate-100 text-slate-700">
                    <td className="whitespace-nowrap px-6 py-3 font-medium text-slate-900">{stay.confirmationCode}</td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <HmsPill tone={STAY_TONE[stay.status] ?? "slate"}>{words(stay.status)}</HmsPill>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">{stay.roomCode ?? stay.roomTypeCode}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums">{stay.nights}</td>
                    <td className="whitespace-nowrap px-6 py-3">{stay.channel ? words(stay.channel) : <Nothing />}</td>
                    <td className="whitespace-nowrap px-6 py-3">{formatBoardDateTime(stay.arrivalAt)}</td>
                    <td className="whitespace-nowrap px-6 py-3">{formatBoardDateTime(stay.departureAt)}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-slate-900">
                      {stay.billed ? (
                        money(stay.billed.total)
                      ) : stay.isPrimary ? (
                        money(stay.totalCharges)
                      ) : (
                        <span className="text-slate-500">On another guest&apos;s bill</span>
                      )}
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
