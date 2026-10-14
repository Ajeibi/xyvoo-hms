import Link from "next/link";
import { BedDouble, Check, CircleAlert, CircleDashed } from "lucide-react";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { HmsCard, HmsEmptyState, hmsButton } from "@/components/hms/hms-ui";

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
  const manageHref = `/hms/${slug}/settings#rooms-pricing-setup`;

  return (
    <HmsCard
      id="hms-rooms-pricing"
      title="Rooms & pricing"
      description="Your rooms, room types and prices, and whether they're all set up."
      icon={BedDouble}
      meaning="rooms"
      actions={
        <Link href={manageHref} className={hmsButton.secondary}>
          Manage setup
        </Link>
      }
    >
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
        <div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
          <span id="rooms-mapped-label">Rooms given a room type</span>
          <span>{Math.round(mappedRatio)}%</span>
        </div>
        <div
          role="progressbar"
          aria-labelledby="rooms-mapped-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(mappedRatio)}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className="h-full rounded-full bg-sky-500 transition-[width]"
            style={{ width: `${mappedRatio}%` }}
          />
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryPill
          label="Configured rooms"
          value={`${summary.configuredRooms}/${summary.totalRooms}`}
          caption="Rooms already given a type"
        />
        <SummaryPill
          label="Room types"
          value={String(summary.roomTypeCount)}
          caption="Categories you sell"
        />
        <SummaryPill
          label="Total floors"
          value={String(totalFloors)}
          caption="Levels in your floor plan (ground = 1 if unset)"
        />
        <SummaryPill label="Rate band" value={rateBand} caption="Current visible sell range" />
      </dl>

      {roomTypes.length ? (
        <ul className="mt-6 grid gap-3 xl:grid-cols-2">
          {roomTypes.map((roomType) => (
            <li key={roomType.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{roomType.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {roomType.rooms} room(s) · sleeps {roomType.maxOccupancy}
                  </p>
                </div>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-900">
                  {roomType.boardBasis}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-600">Base rate</p>
                  <p className="mt-0.5 font-heading text-lg font-semibold text-slate-900">
                    {formatPricingAmount(roomType.baseRate, currency)}
                  </p>
                </div>
                <p className="text-sm text-slate-600">{roomType.rooms} keyed to this room type</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300">
          <HmsEmptyState
            bare
            art="tag"
            meaning="rooms"
            title="No room types or prices yet"
            description="Split your rooms into the types you sell, such as Standard or Deluxe, and give each a price."
            action={
              <Link href={manageHref} className={hmsButton.primary}>
                Set up rooms and prices
              </Link>
            }
          />
        </div>
      )}
    </HmsCard>
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
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
  };
  const Icon = tone === "success" ? Check : tone === "error" ? CircleAlert : CircleDashed;

  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm leading-6 ${toneClasses[tone]}`}>
      <Icon className="mt-1 h-4 w-4 shrink-0" aria-hidden />
      <p>{children}</p>
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
    <div className="rounded-2xl bg-sky-50 px-4 py-4">
      <dt className="text-sm font-medium text-slate-700">{label}</dt>
      <dd className="mt-1 font-heading text-lg font-semibold text-slate-900">{value}</dd>
      <dd className="mt-1 text-xs leading-5 text-slate-600">{caption}</dd>
    </div>
  );
}
