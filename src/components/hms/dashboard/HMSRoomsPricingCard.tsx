import Link from "next/link";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

type RoomPricingSummary = {
  roomTypeCount: number;
  configuredRooms: number;
  totalRooms: number;
  remainingRooms: number;
  excessRooms: number;
  lowestRate: number | null;
  highestRate: number | null;
};

export default function HMSRoomsPricingCard({
  slug,
  roomTypes,
  currency,
  summary,
  totalFloors,
}: {
  slug: string;
  roomTypes: HotelRoomTypeSetup[];
  currency: string;
  summary: RoomPricingSummary;
  totalFloors: number;
}) {
  const rateBand =
    summary.lowestRate !== null
      ? `${formatPricingAmount(summary.lowestRate, currency)} - ${formatPricingAmount(summary.highestRate, currency)}`
      : "Not configured";
  const mappedRatio =
    summary.totalRooms > 0
      ? Math.min((summary.configuredRooms / summary.totalRooms) * 100, 100)
      : 0;

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Rooms & Pricing</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Your active room inventory, pricing structure, and setup health in one view.
          </p>
        </div>
        <Link
          href={`/hms/${slug}/settings#rooms-pricing-setup`}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
        >
          Manage setup
        </Link>
      </div>

      <div className="mt-5">
        {summary.excessRooms > 0 ? (
          <StatusBanner tone="error">
            {summary.configuredRooms} rooms are assigned across room types, which is{" "}
            {summary.excessRooms} above the recorded total of {summary.totalRooms}.
          </StatusBanner>
        ) : summary.remainingRooms > 0 ? (
          <StatusBanner tone="warning">
            {summary.configuredRooms} of {summary.totalRooms} rooms are configured.{" "}
            {summary.remainingRooms} room(s) still need to be assigned to room types.
          </StatusBanner>
        ) : (
          <StatusBanner tone="success">
            All {summary.totalRooms} rooms are mapped into priced room types and ready for
            operations.
          </StatusBanner>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
            <span>Inventory mapped to room types</span>
            <span>{Math.round(mappedRatio)}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width]"
              style={{ width: `${mappedRatio}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryPill
          label="Configured rooms"
          value={`${summary.configuredRooms}/${summary.totalRooms}`}
          caption="Inventory already structured"
        />
        <SummaryPill
          label="Room types"
          value={String(summary.roomTypeCount)}
          caption="Operational categories available"
        />
        <SummaryPill
          label="Total floors"
          value={String(totalFloors)}
          caption="Levels in your floor plan (ground = 1 if unset)"
        />
        <SummaryPill label="Rate band" value={rateBand} caption="Current visible sell range" />
      </div>

      {roomTypes.length ? (
        <div className="mt-6 grid gap-3 xl:grid-cols-2">
          {roomTypes.map((roomType) => (
            <div
              key={roomType.id}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {roomType.name}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {roomType.rooms} room(s) · occupancy {roomType.maxOccupancy}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                  {roomType.boardBasis}
                </span>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                    Base rate
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatPricingAmount(roomType.baseRate, currency)}
                  </p>
                </div>
                <p className="text-xs text-slate-400">
                  {roomType.rooms} keyed to this room type
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6">
          <p className="text-sm font-medium text-slate-900">
            Room types and prices are not configured yet.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Use the Super Admin setup to break your room count into real room categories and
            default rates.
          </p>
        </div>
      )}
    </section>
  );
}

function StatusBanner({
  tone,
  children,
}: {
  tone: "warning" | "success" | "error";
  children: React.ReactNode;
}) {
  const toneClasses = {
    warning: "border-amber-200 bg-amber-50/70 text-amber-800",
    success: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    error: "border-rose-200 bg-rose-50/70 text-rose-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClasses[tone]}`}>
      {children}
    </div>
  );
}

function SummaryPill({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{caption}</p>
    </div>
  );
}
