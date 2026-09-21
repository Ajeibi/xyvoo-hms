import Link from "next/link";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getArrivalDetail } from "@/lib/hms/arrivals-workbench";
import { normalizePricingSetup, formatPricingAmount } from "@/lib/hms/room-pricing";
import { READINESS_LABEL } from "@/components/hms/frontdesk/arrivals/FrontDeskAssignRoomPicker";
import {
  PAYMENT_DOT_CLASS,
  PAYMENT_STATUS_LABEL,
} from "@/components/hms/frontdesk/board/payment-styles";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-blue-50 text-blue-800 ring-blue-200/80",
  checked_in: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
  checked_out: "bg-slate-100 text-slate-700 ring-slate-200/80",
  no_show: "bg-amber-50 text-amber-900 ring-amber-200/80",
  cancelled: "bg-red-50 text-red-800 ring-red-200/80",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset",
        STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 ring-slate-200/80",
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value || "—"}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
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
      <div className="px-8 py-8 max-w-4xl">
        <Link href={`/hms/${slug}/reservations`} className="text-sm font-medium text-blue-600 hover:underline">
          ← Back to reservations
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold tracking-tight text-slate-900">{r.confirmationCode}</h1>
          <StatusPill status={r.status} />
          {r.isVip ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase text-amber-900">
              VIP
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {g?.displayName ?? "Guest not linked"} · {r.bookingSourceLabel} · Folio {r.folioNumber}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {r.status === "confirmed" ? (
            <Link
              href={`/hms/${slug}/reservations/${id}/check-in`}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Complete check-in
            </Link>
          ) : null}
          <Link
            href={`/hms/${slug}/frontdesk/folio`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open folio
          </Link>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Section title="Guest">
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
              <p className="text-sm text-slate-500">No guest linked to this reservation.</p>
            )}
          </Section>

          <Section title="Stay">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Room" value={r.roomCode ? `${r.roomCode} (floor ${r.floor})` : "Unassigned"} />
              <Field
                label="Room readiness"
                value={r.roomReadiness ? READINESS_LABEL[r.roomReadiness] ?? r.roomReadiness : null}
              />
              <Field label="Arrival" value={new Date(r.arrivalAt).toLocaleString()} />
              <Field label="Departure" value={new Date(r.departureAt).toLocaleString()} />
              <Field label="Nights" value={r.nights} />
              <Field label="Party size" value={`${r.adults} adults, ${r.childrenCount} children`} />
              <Field label="Market segment" value={r.marketSegment} />
              <Field label="Bill to" value={r.billToAccount} />
            </dl>
          </Section>

          <Section title="Folio">
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", PAYMENT_DOT_CLASS[folio.displayStatus])} />
              <span className="text-sm font-medium text-slate-900">{PAYMENT_STATUS_LABEL[folio.displayStatus]}</span>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Charges" value={formatPricingAmount(folio.charges, pricing.currency)} />
              <Field label="Credits" value={formatPricingAmount(folio.credits, pricing.currency)} />
              <Field label="Balance" value={folio.balanceFormatted} />
            </dl>
          </Section>

          <Section title="Notes">
            <dl className="grid gap-4">
              <Field label="Guest remarks" value={r.guestRemarks} />
              <Field label="Room preferences" value={r.roomPreferencesText} />
              <Field label="VIP notes" value={r.vipNotes} />
              <Field label="Dietary notes" value={r.dietaryNotes} />
              <Field label="Accessibility notes" value={r.accessibilityNotes} />
            </dl>
          </Section>
        </div>

        <Section title="Activity">
          {activityTimeline.length === 0 ? (
            <p className="text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {activityTimeline.slice(0, 20).map((entry) => (
                <li key={entry.id} className="flex justify-between gap-4 text-sm">
                  <span className="text-slate-700">{entry.message}</span>
                  <span className="shrink-0 text-slate-400">{new Date(entry.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </HMSLayout>
  );
}
