"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import type { ArrivalDetailPayload } from "@/lib/hms/arrivals-workbench";
import type { ArrivalsRoleCapabilities } from "@/lib/hms/arrivals-rbac";
import type { ArrivalWorkbenchRow } from "@/lib/hms/arrivals-workbench";
import type { CheckInStaffOption } from "@/lib/hms/check-in-staff-options";
import { PAYMENT_STATUS_LABEL } from "@/components/hms/frontdesk/board/payment-styles";
import {
  assignRoomApi,
  FrontDeskAssignRoomPicker,
  READINESS_LABEL,
} from "./FrontDeskAssignRoomPicker";

type Step = "verify" | "payment" | "room" | "confirm" | "done";

export function FrontDeskReservationCheckInDialog({
  slug,
  row,
  open,
  onOpenChange,
  onSuccess,
  capabilities,
  checkInStaffOptions,
  defaultCheckedInByUserId,
}: {
  slug: string;
  row: ArrivalWorkbenchRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  capabilities: ArrivalsRoleCapabilities;
  checkInStaffOptions: CheckInStaffOption[];
  defaultCheckedInByUserId: string | null;
}) {
  const [step, setStep] = useState<Step>("verify");
  const [detail, setDetail] = useState<ArrivalDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomUnitId, setRoomUnitId] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [guestRemarks, setGuestRemarks] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [checkedInByUserId, setCheckedInByUserId] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    setStep("verify");
    setError(null);
    setManagerPin("");
    const staffDefault =
      defaultCheckedInByUserId && checkInStaffOptions.some((o) => o.userId === defaultCheckedInByUserId)
        ? defaultCheckedInByUserId
        : checkInStaffOptions.length === 1
          ? checkInStaffOptions[0]!.userId
          : "";
    setCheckedInByUserId(staffDefault);
    setFloorFilter("");
    setLoading(true);
    fetch(`/api/hotel/frontdesk/arrivals/${row.id}?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDetail(d);
        setRoomUnitId(d.reservation.roomUnitId ?? "");
        setGuestRemarks(d.reservation.guestRemarks ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [open, row, slug, checkInStaffOptions, defaultCheckedInByUserId]);

  const settlementLabel = useMemo(() => {
    const m = detail?.reservation.settlementMethod;
    if (m === "direct_bill") return "Direct bill";
    if (m === "card") return "Card";
    if (m === "pos") return "POS terminal";
    if (m === "partial_credit") return "Partial credit";
    if (m === "split") return "Split";
    return "Cash";
  }, [detail]);

  async function reloadDetail() {
    if (!row) return;
    const res = await fetch(`/api/hotel/frontdesk/arrivals/${row.id}?slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
      const d = await res.json();
      setDetail(d);
    }
  }

  async function assignRoomIfNeeded() {
    if (!row || !roomUnitId || roomUnitId === detail?.reservation.roomUnitId) return true;
    const result = await assignRoomApi({
      slug,
      reservationId: row.id,
      roomUnitId,
      managerPin: managerPin || undefined,
    });
    if (!result.ok) {
      setError(result.error ?? "Room assignment failed");
      if (result.requiresPin) setStep("room");
      return false;
    }
    return true;
  }

  async function completeCheckIn() {
    if (!row || !capabilities.canCheckIn) return;
    if (!checkInStaffOptions.length) {
      setError("No hotel staff found. Add team members under Settings before check-in.");
      return;
    }
    if (!checkedInByUserId.trim() || !checkInStaffOptions.some((o) => o.userId === checkedInByUserId)) {
      setError("Select the staff member who checked this guest in.");
      return;
    }
    setLoading(true);
    setError(null);
    const assigned = await assignRoomIfNeeded();
    if (!assigned) {
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/hotel/frontdesk/arrivals/${row.id}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        checkedInByUserId: checkedInByUserId.trim(),
        roomUnitId: roomUnitId || undefined,
        guestRemarks,
        managerPin: managerPin || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      const msg = data.error ?? "Check-in failed";
      setError(msg);
      toastError("Check-in failed", msg);
      if (data.requiresPin) setStep("room");
      return;
    }
    toastSuccess("Guest checked in", row.confirmationCode);
    setStep("done");
    onSuccess();
  }

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
            <p>
              <span className="text-slate-500">Status:</span>{" "}
              {PAYMENT_STATUS_LABEL[detail.folio.displayStatus]}
            </p>
            <p>
              <span className="text-slate-500">Balance:</span> {detail.folio.balanceFormatted}
            </p>
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

        <DialogFooter className="gap-2 sm:gap-0">
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
