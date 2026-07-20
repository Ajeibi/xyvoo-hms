"use client";

import { useEffect, useMemo, useState } from "react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { assignRoomApi } from "@/components/hms/frontdesk/arrivals/FrontDeskAssignRoomPicker";
import type { ArrivalDetailPayload, ArrivalWorkbenchRow } from "@/lib/hms/arrivals-workbench";
import type { ArrivalsRoleCapabilities } from "@/lib/hms/arrivals-rbac";
import type { CheckInStaffOption } from "@/lib/hms/check-in-staff-options";

export type CheckInStep = "verify" | "payment" | "room" | "confirm" | "done";

/** Only these three fields are ever read — kept minimal so any reservation list (Arrivals, the
 * full Reservations list) can drive a check-in without needing the full workbench row shape. */
export type CheckInRow = Pick<ArrivalWorkbenchRow, "id" | "confirmationCode" | "guestName">;

/**
 * Shared state/logic behind "complete check-in for an existing reservation" — same steps
 * (verify → payment → room → confirm) and same API calls whether presented as a quick popup
 * (Arrivals) or a dedicated full page (Reservations list).
 */
export function useReservationCheckIn({
  slug,
  row,
  active,
  capabilities,
  checkInStaffOptions,
  defaultCheckedInByUserId,
  onSuccess,
}: {
  slug: string;
  row: CheckInRow | null;
  /** True once this flow should load/reset — a dialog's `open`, or always-true for a page. */
  active: boolean;
  capabilities: ArrivalsRoleCapabilities;
  checkInStaffOptions: CheckInStaffOption[];
  defaultCheckedInByUserId: string | null;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<CheckInStep>("verify");
  const [detail, setDetail] = useState<ArrivalDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomUnitId, setRoomUnitId] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [guestRemarks, setGuestRemarks] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [checkedInByUserId, setCheckedInByUserId] = useState("");

  useEffect(() => {
    if (!active || !row) return;
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
  }, [active, row, slug, checkInStaffOptions, defaultCheckedInByUserId]);

  const settlementLabel = useMemo(() => {
    const m = detail?.reservation.settlementMethod;
    if (m === "direct_bill") return "Direct bill";
    if (m === "card") return "Card";
    if (m === "pos") return "POS terminal";
    if (m === "partial_credit") return "Partial credit";
    if (m === "split") return "Split";
    return "Cash";
  }, [detail]);

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

  return {
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
  };
}
