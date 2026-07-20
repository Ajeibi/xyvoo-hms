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
import { useReservationCheckIn, type CheckInRow } from "@/lib/hms/useReservationCheckIn";

export type { CheckInRow as ReservationCheckInDialogRow } from "@/lib/hms/useReservationCheckIn";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Check in — {row.confirmationCode}</DialogTitle>
          <DialogDescription>{row.guestName}</DialogDescription>
        </DialogHeader>

        {loading && !detail ? (
          <p className="text-sm text-slate-500">Loading reservation…</p>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {step === "verify" && detail ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-slate-500">Arrival:</span>{" "}
              {new Date(detail.reservation.arrivalAt).toLocaleString("en-US", { timeZone: "UTC" })}
            </p>
            <p>
              <span className="text-slate-500">Room:</span>{" "}
              {detail.reservation.roomCode ?? "Not assigned"}
              {detail.reservation.roomReadiness
                ? ` (${READINESS_LABEL[detail.reservation.roomReadiness] ?? detail.reservation.roomReadiness})`
                : ""}
            </p>
          </div>
        ) : null}

        {step === "payment" && detail && capabilities.canViewFolioFinancials ? (
          <div className="space-y-3 text-sm">
            {detail.folio.charges === 0 && detail.reservation.status === "confirmed" ? (
              <>
                <p>
                  <span className="text-slate-500">Expected total for stay:</span>{" "}
                  {formatPricingAmount(detail.reservation.totalRoomCharges, currency)}
                </p>
                <p className="text-xs text-slate-500">
                  Room charges haven&apos;t posted to the folio yet — they post automatically when you complete
                  check-in.
                </p>
              </>
            ) : (
              <>
                <p>
                  <span className="text-slate-500">Status:</span>{" "}
                  {PAYMENT_STATUS_LABEL[detail.folio.displayStatus]}
                </p>
                <p>
                  <span className="text-slate-500">Balance:</span> {detail.folio.balanceFormatted}
                </p>
              </>
            )}
            <p>
              <span className="text-slate-500">Settlement:</span> {settlementLabel}
            </p>
            {capabilities.canPostFolioPayments ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/hms/${slug}/frontdesk/folio?reservationId=${row?.id ?? ""}`} target="_blank">
                  Record cash / POS on folio
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
          <div className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="arrival-checked-in-by" className="block text-sm font-medium text-slate-700">
                Checked in by <span className="text-rose-600">*</span>
              </label>
              {checkInStaffOptions.length === 0 ? (
                <p className="text-sm text-amber-800">
                  Your account is not linked to this hotel. Ask an administrator to add you under Settings before
                  completing check-in.
                </p>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                  {checkInStaffOptions[0]!.displayName}
                </p>
              )}
              <p className="text-xs text-slate-500">
                Saved on the reservation so you can see who handled the arrival.
              </p>
            </div>
            <label className="block text-sm font-medium text-slate-700">Guest remarks</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={3}
              value={guestRemarks}
              onChange={(e) => setGuestRemarks(e.target.value)}
              disabled={!capabilities.canEditNotes}
            />
            <p className="text-xs text-slate-500">
              Completing check-in will mark the room occupied and post room charges if not already on folio.
            </p>
          </div>
        ) : null}

        {step === "done" ? (
          <p className="text-sm font-medium text-emerald-700">Guest checked in successfully.</p>
        ) : null}

        <DialogFooter className="gap-2">
          {step === "verify" ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => setStep(capabilities.canViewFolioFinancials ? "payment" : "room")}
                disabled={!detail}
              >
                Next
              </Button>
            </>
          ) : null}
          {step === "payment" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("verify")}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep("room")}>
                Continue
              </Button>
            </>
          ) : null}
          {step === "room" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("payment")}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep("confirm")} disabled={!roomUnitId}>
                Next: Confirm
              </Button>
            </>
          ) : null}
          {step === "confirm" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("room")}>
                Back
              </Button>
              <Button
                type="button"
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
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
