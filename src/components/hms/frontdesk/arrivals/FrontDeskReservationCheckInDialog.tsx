"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FrontDeskAssignRoomPicker, READINESS_LABEL } from "./FrontDeskAssignRoomPicker";
import type { ArrivalsRoleCapabilities } from "@/lib/hms/arrivals-rbac";
import type { CheckInStaffOption } from "@/lib/hms/check-in-staff-options";
import { PAYMENT_STATUS_LABEL } from "@/components/hms/frontdesk/board/payment-styles";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useReservationCheckIn, type CheckInRow, type CheckInStep } from "@/lib/hms/useReservationCheckIn";
import { BedDouble, CheckCircle2, CreditCard, DoorOpen, UserCheck } from "lucide-react";
import { HmsAlert, HmsField, HmsIconBadge, hmsInput } from "@/components/hms/hms-ui";

export type { CheckInRow as ReservationCheckInDialogRow } from "@/lib/hms/useReservationCheckIn";

const STEP_LABEL: Record<CheckInStep, string> = {
  verify: "check the booking",
  payment: "check payment",
  room: "choose the room",
  confirm: "confirm and check in",
  done: "done",
};

const STEP_ICON: Record<CheckInStep, React.ComponentType<{ className?: string }>> = {
  verify: DoorOpen,
  payment: CreditCard,
  room: BedDouble,
  confirm: UserCheck,
  done: CheckCircle2,
};

export function FrontDeskReservationCheckInDialog({
  slug,
  row,
  open,
  onOpenChange,
  onSuccess,
  capabilities,
  checkInStaffOptions,
  defaultCheckedInByUserId,
  currency = "NGN",
}: {
  slug: string;
  row: CheckInRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  capabilities: ArrivalsRoleCapabilities;
  checkInStaffOptions: CheckInStaffOption[];
  defaultCheckedInByUserId: string | null;
  /** For the pre-arrival "expected total" line — this is a reservation's known room rate, not the
   * folio balance (which is legitimately 0/unknown until charges post at check-in). */
  currency?: string;
}) {
  const {
    step,
    setStep,
    detail,
    loading,
    error,
    roomUnitId,
    setRoomUnitId,
    floorFilter,
    setFloorFilter,
    guestRemarks,
    setGuestRemarks,
    managerPin,
    setManagerPin,
    checkedInByUserId,
    settlementLabel,
    completeCheckIn,
  } = useReservationCheckIn({
    slug,
    row,
    active: open,
    capabilities,
    checkInStaffOptions,
    defaultCheckedInByUserId,
    onSuccess,
  });

  if (!row) return null;

  const steps: CheckInStep[] = capabilities.canViewFolioFinancials
    ? ["verify", "payment", "room", "confirm"]
    : ["verify", "room", "confirm"];
  const stepIndex = steps.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="flex-row items-start gap-3 space-y-0 text-left">
          <HmsIconBadge icon={STEP_ICON[step] ?? DoorOpen} meaning={step === "payment" ? "money" : "rooms"} />
          <div className="min-w-0">
            <DialogTitle className="font-heading">Check in · {row.confirmationCode}</DialogTitle>
            <DialogDescription className="text-slate-600">{row.guestName}</DialogDescription>
          </div>
        </DialogHeader>

        {stepIndex >= 0 ? (
          <p className="text-sm font-medium text-slate-700" aria-live="polite">
            Step {stepIndex + 1} of {steps.length}: {STEP_LABEL[step]}
          </p>
        ) : null}

        {loading && !detail ? (
          <p role="status" className="text-sm text-slate-600">
            Loading booking…
          </p>
        ) : null}
        {error ? <HmsAlert message={error} /> : null}

        {step === "verify" && detail ? (
          <dl className="grid gap-3 rounded-xl bg-sky-50 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-600">Arrival</dt>
              <dd className="font-medium text-slate-900">
                {new Date(detail.reservation.arrivalAt).toLocaleString("en-US", { timeZone: "UTC" })}
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">Room</dt>
              <dd className="font-medium text-slate-900">
                {detail.reservation.roomCode ?? "Not assigned yet"}
                {detail.reservation.roomReadiness
                  ? ` (${READINESS_LABEL[detail.reservation.roomReadiness] ?? detail.reservation.roomReadiness})`
                  : ""}
              </dd>
            </div>
          </dl>
        ) : null}

        {step === "payment" && detail && capabilities.canViewFolioFinancials ? (
          <div className="space-y-3 rounded-xl bg-emerald-50 p-4 text-sm">
            {detail.folio.charges === 0 && detail.reservation.status === "confirmed" ? (
              <>
                <p>
                  <span className="text-slate-600">Expected total for the stay:</span>{" "}
                  <span className="font-medium text-slate-900">
                    {formatPricingAmount(detail.reservation.totalRoomCharges, currency)}
                  </span>
                </p>
                <p className="text-sm text-slate-700">
                  Room charges aren&apos;t on the folio yet. They&apos;re added automatically when you complete
                  check-in.
                </p>
              </>
            ) : (
              <>
                <p>
                  <span className="text-slate-600">Payment:</span>{" "}
                  <span className="font-medium text-slate-900">{PAYMENT_STATUS_LABEL[detail.folio.displayStatus]}</span>
                </p>
                <p>
                  <span className="text-slate-600">Balance:</span>{" "}
                  <span className="font-medium text-slate-900">{detail.folio.balanceFormatted}</span>
                </p>
              </>
            )}
            <p>
              <span className="text-slate-600">How they&apos;ll pay:</span>{" "}
              <span className="font-medium text-slate-900">{settlementLabel}</span>
            </p>
            {capabilities.canPostFolioPayments ? (
              <Button asChild variant="outline" size="sm" className="rounded-xl bg-white">
                <Link href={`/hms/${slug}/frontdesk/folio?reservationId=${row?.id ?? ""}`} target="_blank">
                  Record a cash or card payment on the folio
                  <span className="sr-only"> (opens in a new tab)</span>
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "room" && detail && capabilities.canAssignRoom ? (
          <FrontDeskAssignRoomPicker
            slug={slug}
            reservationId={row.id}
            roomTypeCode={detail.reservation.roomTypeCode}
            assignableRooms={detail.assignableRooms}
            roomUnitId={roomUnitId}
            onRoomUnitIdChange={setRoomUnitId}
            managerPin={managerPin}
            onManagerPinChange={setManagerPin}
            canOverrideRoom={capabilities.canOverrideRoom}
            floorFilter={floorFilter}
            onFloorFilterChange={setFloorFilter}
          />
        ) : null}

        {step === "confirm" && detail ? (
          <div className="space-y-4">
            <div>
              <p id="arrival-checked-in-by-label" className="mb-1 block text-sm font-medium text-slate-800">
                Checked in by
              </p>
              {checkInStaffOptions.length === 0 ? (
                <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Your account isn&apos;t linked to this hotel yet. Ask an administrator to add you in Settings, then
                  you can complete check-in.
                </p>
              ) : (
                <p
                  aria-labelledby="arrival-checked-in-by-label"
                  aria-describedby="arrival-checked-in-by-hint"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900"
                >
                  {checkInStaffOptions[0]!.displayName}
                </p>
              )}
              <p id="arrival-checked-in-by-hint" className="mt-1 text-xs text-slate-600">
                Saved on the booking so you can see who welcomed the guest.
              </p>
            </div>
            <HmsField id="arrival-checkin-remarks" label="Guest remarks" optional>
              <textarea
                id="arrival-checkin-remarks"
                className={hmsInput}
                rows={3}
                value={guestRemarks}
                onChange={(e) => setGuestRemarks(e.target.value)}
                disabled={!capabilities.canEditNotes}
              />
            </HmsField>
            <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-slate-700">
              Completing check-in marks the room as occupied and adds the room charges to the folio if they
              aren&apos;t there already.
            </p>
          </div>
        ) : null}

        {step === "done" ? (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Guest checked in.
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          {step === "verify" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl font-semibold"
                onClick={() => setStep(capabilities.canViewFolioFinancials ? "payment" : "room")}
                disabled={!detail}
              >
                Next
              </Button>
            </>
          ) : null}
          {step === "payment" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep("verify")}>
                Back
              </Button>
              <Button type="button" className="rounded-xl font-semibold" onClick={() => setStep("room")}>
                Next
              </Button>
            </>
          ) : null}
          {step === "room" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep("payment")}>
                Back
              </Button>
              <Button type="button" className="rounded-xl font-semibold" onClick={() => setStep("confirm")} disabled={!roomUnitId}>
                Next: confirm
              </Button>
            </>
          ) : null}
          {step === "confirm" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep("room")}>
                Back
              </Button>
              <Button
                type="button"
                className="rounded-xl font-semibold"
                onClick={() => completeCheckIn()}
                disabled={
                  loading ||
                  !checkedInByUserId.trim() ||
                  checkInStaffOptions.length === 0 ||
                  !checkInStaffOptions.some((o) => o.userId === checkedInByUserId)
                }
              >
                Complete check-in
              </Button>
            </>
          ) : null}
          {step === "done" ? (
            <Button type="button" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
