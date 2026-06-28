import Link from "next/link";
import type { GuestProfileData } from "@/lib/hms/guest-profile";
import { formatGuestProfileRevenue } from "@/lib/hms/guest-profile";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { GuestDetailRows } from "@/components/hms/frontdesk/board/guest-details";

export function GuestProfileView({ slug, data }: { slug: string; data: GuestProfileData }) {
  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <Link href={`/hms/${slug}/guests`} className="text-sm text-blue-600 hover:underline">
        ← Guests
      </Link>
      <header className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Guest profile</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{data.guest.displayName}</h1>
        {data.guest.tags.length > 0 ? (
          <p className="mt-3 flex flex-wrap gap-1.5">
            {data.guest.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold uppercase text-violet-800"
              >
                {tag}
              </span>
            ))}
          </p>
        ) : null}
        <dl className="mt-4">
          <GuestDetailRows guest={data.guest} />
        </dl>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Completed stays</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{data.visitCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total revenue</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatGuestProfileRevenue(data.totalRevenue, data.currency)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Open balance (est.)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatGuestProfileRevenue(data.openBalance, data.currency)}
          </p>
        </div>
      </div>

      {data.preferences ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Preferences & notes</h2>
          <p className="mt-2 text-sm text-slate-600">{data.preferences}</p>
        </section>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Stay history</h2>
        </div>
        {data.stays.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No reservations linked.</p>
        ) : (
          <div className="thin-scrollbar overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="min-w-[720px] w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-6 py-3">Ref</th>
                  <th className="whitespace-nowrap px-6 py-3">Status</th>
                  <th className="whitespace-nowrap px-6 py-3">Room</th>
                  <th className="whitespace-nowrap px-6 py-3">Arrival</th>
                  <th className="whitespace-nowrap px-6 py-3">Departure</th>
                  <th className="whitespace-nowrap px-6 py-3 text-right">Charges</th>
                </tr>
              </thead>
              <tbody>
                {data.stays.map((stay) => (
                  <tr key={stay.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-6 py-3 font-medium">{stay.confirmationCode}</td>
                    <td className="whitespace-nowrap px-6 py-3 capitalize">{stay.status.replace(/_/g, " ")}</td>
                    <td className="whitespace-nowrap px-6 py-3">{stay.roomCode ?? "—"}</td>
                    <td className="whitespace-nowrap px-6 py-3">{formatBoardDateTime(stay.arrivalAt)}</td>
                    <td className="whitespace-nowrap px-6 py-3">{formatBoardDateTime(stay.departureAt)}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums">
                      {formatGuestProfileRevenue(stay.totalCharges, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.serviceRequests.length > 0 ? (
        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Guest service requests</h2>
            <p className="mt-1 text-xs text-slate-500">
              Recent requests across linked reservations.{" "}
              <Link
                href={`/hms/${slug}/frontdesk/guest-services`}
                className="text-blue-600 hover:underline"
              >
                Open workbench
              </Link>
            </p>
          </div>
          <div className="thin-scrollbar overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="min-w-[640px] w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-6 py-3">Created</th>
                  <th className="whitespace-nowrap px-6 py-3">Type</th>
                  <th className="whitespace-nowrap px-6 py-3">Category</th>
                  <th className="whitespace-nowrap px-6 py-3">Status</th>
                  <th className="whitespace-nowrap px-6 py-3">Ref</th>
                  <th className="whitespace-nowrap px-6 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {data.serviceRequests.map((svc) => (
                  <tr key={svc.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                      {formatBoardDateTime(svc.createdAt)}
                    </td>
                    <td className="px-6 py-3 font-medium">{svc.requestType}</td>
                    <td className="px-6 py-3 capitalize text-slate-600">
                      {svc.serviceCategory.replace(/_/g, " ")}
                    </td>
                    <td className="px-6 py-3 capitalize">{svc.status.replace(/_/g, " ")}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                      {svc.confirmationCode ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right">
                      <Link
                        href={`/hms/${slug}/frontdesk/guest-services?q=${encodeURIComponent(svc.id)}`}
                        className="text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
