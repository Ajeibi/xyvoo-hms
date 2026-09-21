"use client";

import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { FrontDeskRoomAssignmentPicker } from "@/components/hms/frontdesk/FrontDeskRoomAssignmentPicker";
import { WalkInAccompanyingAdultCard, WalkInMinorGuestCard } from "@/components/hms/frontdesk/WalkInGuestDetailFields";
import { Input } from "@/components/ui/input";
import type { CheckInRoomUnit } from "@/lib/hms/check-in-room-units";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import type { AccompanyingAdultGuest, MinorGuest } from "@/lib/hms/walk-in-check-in-payload";

type RoomTypePickerOption = { value: string; label: string; description?: string; disabled?: boolean };
type OccupancyCheck = { ok: true } | { ok: false; message: string };

/** Extracted verbatim from FrontDeskCheckInForm.tsx (P2 refactor — no behavior change). */
export function StayInformationFieldset({
  arrivalDate,
  setArrivalDate,
  arrivalTime,
  setArrivalTime,
  departureDate,
  setDepartureDate,
  departureTime,
  setDepartureTime,
  nights,
  roomTypeCode,
  setRoomTypeCode,
  roomTypes,
  roomTypePickerOptions,
  selectedType,
  effectiveOccupancyMax,
  headcount,
  occupancyCheck,
  roomUnits,
  assignedRoom,
  setAssignedRoom,
  adultsInput,
  setAdultsInput,
  adults,
  childrenInput,
  setChildrenInput,
  childrenCount,
  infantsInput,
  setInfantsInput,
  infants,
}: {
  arrivalDate: string;
  setArrivalDate: (v: string) => void;
  arrivalTime: string;
  setArrivalTime: (v: string) => void;
  departureDate: string;
  setDepartureDate: (v: string) => void;
  departureTime: string;
  setDepartureTime: (v: string) => void;
  nights: number;
  roomTypeCode: string;
  setRoomTypeCode: (v: string) => void;
  roomTypes: HotelRoomTypeSetup[];
  roomTypePickerOptions: RoomTypePickerOption[];
  selectedType: HotelRoomTypeSetup | undefined;
  effectiveOccupancyMax: number | undefined;
  headcount: number;
  occupancyCheck: OccupancyCheck;
  roomUnits: CheckInRoomUnit[];
  assignedRoom: string;
  setAssignedRoom: (v: string) => void;
  adultsInput: string;
  setAdultsInput: (v: string) => void;
  adults: number;
  childrenInput: string;
  setChildrenInput: (v: string) => void;
  childrenCount: number;
  infantsInput: string;
  setInfantsInput: (v: string) => void;
  infants: number;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Stay information</span>
        <CheckInFieldInfo
          label="Stay information"
          text="Dates, times, occupancy, and room product for this reservation. Drives nights, rates, and room assignment rules."
        />
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="arrivalDate"
            required
            helpTitle="Arrival date"
            helpText="Defaults to today’s date in your browser’s local calendar when you open this form. Must be before departure."
          >
            Arrival date
          </CheckInFieldLabelRow>
          <Input
            id="arrivalDate"
            type="date"
            required
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="arrivalTime"
            required
            helpTitle="Arrival time"
            helpText="Defaults to the current local time when you open this form; change it if the guest arrived earlier or later."
          >
            Arrival time
          </CheckInFieldLabelRow>
          <Input
            id="arrivalTime"
            type="time"
            required
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="departureDate"
            required
            helpTitle="Departure date"
            helpText="Calendar date the stay ends (checkout date). With arrival date, defines how many nights are billed."
          >
            Departure date
          </CheckInFieldLabelRow>
          <Input
            id="departureDate"
            type="date"
            required
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="departureTime"
            required
            helpTitle="Departure time"
            helpText="Planned checkout time on the departure date. Often aligns with hotel checkout policy (e.g. 12:00)."
          >
            Departure time
          </CheckInFieldLabelRow>
          <Input
            id="departureTime"
            type="time"
            required
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 sm:col-span-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-medium text-slate-800">
              Nights: <span className="tabular-nums text-blue-700">{nights}</span>
            </p>
            <CheckInFieldInfo
              label="Nights"
              text="Number of hotel nights between arrival and departure dates (inclusive counting by calendar nights). Used for room charges and the rate summary."
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            From calendar dates (hotel night count). Times are stored on the reservation for arrival / departure.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <CheckInFieldLabelRow
            htmlFor="roomTypeCode"
            required
            helpTitle="Room type"
            helpText="Product category for pricing and BAR. Max guests for the counts below follow this type until you assign a physical room — then limits follow that key’s inventory type (see assign room)."
          >
            Room type
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id="roomTypeCode"
            value={roomTypeCode}
            onChange={setRoomTypeCode}
            disabled={roomTypes.length === 0}
            placeholder="Select room type…"
            emptyStateMessage="Configure room types in hotel settings."
            options={roomTypePickerOptions}
          />
          {selectedType ? (
            <p className="text-xs text-slate-500">
              Max guests (adults + children + infants): <strong>{effectiveOccupancyMax ?? selectedType.maxOccupancy}</strong>.
              Current headcount: <strong>{headcount}</strong>.
            </p>
          ) : null}
          {!occupancyCheck.ok ? <p className="text-xs font-medium text-rose-600">{occupancyCheck.message}</p> : null}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <CheckInFieldLabelRow
            htmlFor="roomCode"
            helpTitle="Assign room (optional)"
            helpText="Physical room key from inventory. If set, status becomes occupied and pricing follows this room’s configured type. Leave blank to assign later."
          >
            Assign room (optional)
          </CheckInFieldLabelRow>
          <FrontDeskRoomAssignmentPicker
            id="roomCode"
            name="roomCode"
            rooms={roomUnits}
            roomTypeCode={roomTypeCode}
            roomTypeName={selectedType?.name}
            value={assignedRoom}
            onChange={setAssignedRoom}
          />
          <p className="text-xs text-slate-500">
            Only vacant keys for <strong>{selectedType?.name ?? "the selected room type"}</strong> are listed.
          </p>
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="adults"
            helpTitle="Adults"
            helpText="Number of guests aged as adults for occupancy limits and extra-person pricing. At least one adult is required."
          >
            Adults
          </CheckInFieldLabelRow>
          <Input
            id="adults"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Adults"
            value={adultsInput}
            onChange={(e) => setAdultsInput(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setAdultsInput(String(adults))}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="children"
            helpTitle="Children"
            helpText="Number of child guests. Counts toward room max occupancy; may add extra-child charges from hotel pricing settings."
          >
            Children
          </CheckInFieldLabelRow>
          <Input
            id="children"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Children"
            value={childrenInput}
            onChange={(e) => setChildrenInput(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setChildrenInput(String(childrenCount))}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="infants"
            helpTitle="Infants"
            helpText="Babies or infants not using a bed, still counted in max occupancy for fire and safety limits. Usually no extra-child charge unless your policy says otherwise."
          >
            Infants
          </CheckInFieldLabelRow>
          <Input
            id="infants"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Infants"
            value={infantsInput}
            onChange={(e) => setInfantsInput(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setInfantsInput(String(infants))}
            className="h-10 rounded-xl"
          />
        </div>
      </div>
    </fieldset>
  );
}

export function AdditionalGuestsFieldset({
  additionalAdults,
  setAdditionalAdults,
  childGuests,
  setChildGuests,
  infantGuests,
  setInfantGuests,
  phone,
  primaryEmailInput,
}: {
  additionalAdults: AccompanyingAdultGuest[];
  setAdditionalAdults: (updater: (prev: AccompanyingAdultGuest[]) => AccompanyingAdultGuest[]) => void;
  childGuests: MinorGuest[];
  setChildGuests: (updater: (prev: MinorGuest[]) => MinorGuest[]) => void;
  infantGuests: MinorGuest[];
  setInfantGuests: (updater: (prev: MinorGuest[]) => MinorGuest[]) => void;
  phone: string | undefined;
  primaryEmailInput: string;
}) {
  if (additionalAdults.length === 0 && childGuests.length === 0 && infantGuests.length === 0) return null;

  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Additional guests</span>
        <CheckInFieldInfo
          label="Additional guests"
          text="Identity for every other person on the stay. Adults need full ID details; children and infants need name and date of birth."
        />
      </legend>
      <div className="space-y-4">
        {additionalAdults.map((g, i) => (
          <WalkInAccompanyingAdultCard
            key={`adult-${i}`}
            guestNumber={i + 2}
            value={g}
            onChange={(next) => setAdditionalAdults((prev) => prev.map((row, j) => (j === i ? next : row)))}
            primaryPhone={phone?.trim() ?? ""}
            primaryEmail={primaryEmailInput}
          />
        ))}
        {childGuests.map((g, i) => (
          <WalkInMinorGuestCard
            key={`child-${i}`}
            label={`Child ${i + 1}`}
            value={g}
            onChange={(next) => setChildGuests((prev) => prev.map((row, j) => (j === i ? next : row)))}
          />
        ))}
        {infantGuests.map((g, i) => (
          <WalkInMinorGuestCard
            key={`infant-${i}`}
            label={`Infant ${i + 1}`}
            value={g}
            onChange={(next) => setInfantGuests((prev) => prev.map((row, j) => (j === i ? next : row)))}
          />
        ))}
      </div>
    </fieldset>
  );
}
