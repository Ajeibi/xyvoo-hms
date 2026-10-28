import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble, History, NotebookPen, Receipt, UserRound } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { ReservationDepositCard } from "@/components/hms/reservations/ReservationDepositCard";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getArrivalDetail } from "@/lib/hms/arrivals-workbench";
import { normalizePricingSetup, formatPricingAmount } from "@/lib/hms/room-pricing";
import { READINESS_LABEL } from "@/components/hms/frontdesk/arrivals/FrontDeskAssignRoomPicker";
import type { PaymentDisplayStatus } from "@/lib/hms/front-desk-board";
import { PAYMENT_STATUS_LABEL } from "@/components/hms/frontdesk/board/payment-styles";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

const STATUS: Record<string, { label: string; tone: "slate" | "green" | "amber" | "red" | "blue" }> = {
  confirmed: { label: "Confirmed", tone: "blue" },
  checked_in: { label: "Checked in", tone: "green" },
  checked_out: { label: "Checked out", tone: "slate" },
  no_show: { label: "No-show", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "red" },
};

const PAYMENT_TONE: Record<PaymentDisplayStatus, "slate" | "green" | "amber" | "red" | "blue"> = {
  paid: "green",
  partial: "blue",
  unpaid: "red",
  refund_pending: "amber",
  unknown: "slate",
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status];
  return <HmsPill tone={s?.tone ?? "slate"}>{s?.label ?? status.replace(/_/g, " ")}</HmsPill>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value || "Not given"}</dd>
    </div>
  );
}

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) notFound();

  const pricing = normalizePricingSetup(tenant.pricing_setup);
  const detail = await getArrivalDetail({ tenantId: tenant.id, reservationId: id, currency: pricing.currency });
  if (!detail) notFound();

  const { reservation: r, guest: g, folio, activityTimeline } = detail;

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <HmsPage>
        <Link
          href={`/hms/${slug}/reservations`}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to reservations
        </Link>

        <HmsPageHeader
          eyebrow="Reservations"
          meaning="rooms"
          title={`Booking ${r.confirmationCode}`}
          description={
            <>
              <span className="mr-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
                <StatusPill status={r.status} />
                {r.isVip ? <HmsPill tone="amber">VIP guest</HmsPill> : null}
              </span>
              {g?.displayName ?? "No guest linked"} · {r.bookingSourceLabel} · Bill {r.folioNumber}
            </>
          }
          actions={
            <>
              {r.status === "confirmed" ? (
                <Link href={`/hms/${slug}/reservations/${id}/check-in`} className={`${hmsButton.primary} ${focusRing}`}>
                  Complete check-in
                </Link>
              ) : null}
              <Link href={`/hms/${slug}/frontdesk/folio`} className={`${hmsButton.secondary} ${focusRing}`}>
                Open the guest bill
              </Link>
            </>
          }
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <HmsCard id="reservation-guest" icon={UserRound} meaning="guests" title="Guest">
            {g ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={g.displayName} />
                <Field label="Phone" value={g.phone} />
                <Field label="Email" value={g.email} />
                <Field label="Nationality" value={g.nationality} />
                <Field label="ID" value={g.idNumber ? `${g.idType} · ${g.idNumber}` : null} />
                <Field label="Preferred contact" value={g.preferredChannel} />
              </dl>
            ) : (
              <p className="text-sm text-slate-600">No guest is linked to this booking yet.</p>
            )}
          </HmsCard>

          <HmsCard id="reservation-stay" icon={BedDouble} meaning="rooms" title="Stay">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Room" value={r.roomCode ? `${r.roomCode} (floor ${r.floor})` : "Not assigned yet"} />
              <Field
                label="Room readiness"
                value={r.roomReadiness ? READINESS_LABEL[r.roomReadiness] ?? r.roomReadiness : null}
              />
              <Field label="Arrival" value={new Date(r.arrivalAt).toLocaleString("en-GB")} />
              <Field label="Departure" value={new Date(r.departureAt).toLocaleString("en-GB")} />
              <Field label="Nights" value={r.nights} />
              <Field label="Party size" value={`${r.adults} adults, ${r.childrenCount} children`} />
              <Field label="Market segment" value={r.marketSegment} />
              <Field label="Bill to" value={r.billToAccount} />
            </dl>
          </HmsCard>

          <HmsCard
            id="reservation-folio"
            icon={Receipt}
            meaning="money"
            title="Guest bill"
            actions={<HmsPill tone={PAYMENT_TONE[folio.displayStatus]}>{PAYMENT_STATUS_LABEL[folio.displayStatus]}</HmsPill>}
          >
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <Field label="Charges" value={formatPricingAmount(folio.charges, pricing.currency)} />
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <Field label="Payments" value={formatPricingAmount(folio.credits, pricing.currency)} />
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <Field label="Still to pay" value={folio.balanceFormatted} />
              </div>
            </dl>
          </HmsCard>

          <ReservationDepositCard slug={slug} reservationId={r.id} currency={pricing.currency} />

          <HmsCard id="reservation-notes" icon={NotebookPen} meaning="guests" title="Notes">
            <dl className="grid gap-4">
              <Field label="Guest remarks" value={r.guestRemarks} />
              <Field label="Room preferences" value={r.roomPreferencesText} />
              <Field label="VIP notes" value={r.vipNotes} />
              <Field label="Dietary notes" value={r.dietaryNotes} />
              <Field label="Accessibility notes" value={r.accessibilityNotes} />
            </dl>
          </HmsCard>
        </div>

        <HmsCard id="reservation-activity" icon={History} meaning="neutral" title="What's happened" description="The latest changes to this booking.">
          {activityTimeline.length === 0 ? (
            <HmsEmptyState bare art="chart" title="Nothing recorded yet" description="Changes to this booking, such as a room move or a payment, will be listed here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activityTimeline.slice(0, 20).map((entry) => (
                <li key={entry.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="text-slate-800">{entry.message}</span>
                  <span className="shrink-0 text-slate-600">{new Date(entry.createdAt).toLocaleString("en-GB")}</span>
                </li>
              ))}
            </ul>
          )}
        </HmsCard>
      </HmsPage>
    </HMSLayout>
  );
}
