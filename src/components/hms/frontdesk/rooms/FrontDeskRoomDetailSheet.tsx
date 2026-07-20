"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { openCheckoutDialog } from "@/lib/hms/open-checkout-bus";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { RoomDetailPayload } from "@/lib/hms/rooms-workbench";
import {
  getCachedRoomDetail,
  invalidateRoomDetail,
  setCachedRoomDetail,
} from "@/lib/hms/room-detail-cache";
import type { RoomsRoleCapabilities } from "@/lib/hms/rooms-rbac";
import type { FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { FrontDeskRoomFlagsEditor } from "../board/FrontDeskRoomFlagsEditor";
import { ROOM_STATUS_CELL_CLASS } from "../board/status-styles";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { RoomOpsAction } from "./FrontDeskRoomOpsPanel";

const ROOM_UNIT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "vacant_clean", label: "Vacant — clean" },
  { value: "dirty", label: "Dirty" },
  { value: "cleaning_in_progress", label: "Cleaning in progress" },
  { value: "inspected", label: "Inspected" },
  { value: "ready_for_occupancy", label: "Ready for occupancy" },
  { value: "occupied", label: "Occupied" },
  { value: "maintenance", label: "Maintenance" },
  { value: "out_of_order", label: "Out of service" },
];

function unitStatusSelectOptions(unitStatus: string, hasCheckedInGuest: boolean) {
  if (hasCheckedInGuest) {
    const allowed = new Set(["dirty", "cleaning_in_progress", "occupied", unitStatus]);
    return ROOM_UNIT_STATUS_OPTIONS.filter((o) => allowed.has(o.value));
  }
  return ROOM_UNIT_STATUS_OPTIONS;
}

function InlineCardSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
    </Card>
  );
}

export function FrontDeskRoomDetailSheet({
  slug,
  room,
  open,
  onOpenChange,
  capabilities,
  currency,
  onOpenOp,
}: {
  slug: string;
  room: FrontDeskRoomBoardItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capabilities: RoomsRoleCapabilities;
  currency: string;
  onOpenOp: (action: RoomOpsAction) => void;
}) {
  const [detail, setDetail] = useState<RoomDetailPayload | null>(null);
  const [history, setHistory] = useState<{
    audit: { id: string; message: string; createdAt: string }[];
    pastStays?: { id: string; confirmationCode: string; status: string; arrivalAt: string; departureAt: string }[];
    hkCleans?: { id: string; status: string; priorityLevel: string | null; notes: string | null; updatedAt: string }[];
    incidents?: { id: string; incidentType: string; description: string; status: string; createdAt: string }[];
  } | null>(null);
  const [historyTab, setHistoryTab] = useState<"audit" | "guests" | "hk" | "incidents">("audit");
  const [assets, setAssets] = useState<
    { id: string; assetType: string; label: string; condition: string; serialNumber: string | null }[]
  >([]);
  const [supplementLoading, setSupplementLoading] = useState(false);
  const [supplementError, setSupplementError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRequested, setHistoryRequested] = useState(false);
  const [assetsRequested, setAssetsRequested] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState("");
  const [incidentType, setIncidentType] = useState("maintenance");
  const [incidentDesc, setIncidentDesc] = useState("");
  const [assetLabel, setAssetLabel] = useState("");
  const [assetType, setAssetType] = useState("other");
  const router = useRouter();

  const loadSupplement = useCallback(
    async (force = false) => {
      if (!room) return;
      if (!force) {
        const cached = getCachedRoomDetail(room.id);
        if (cached) {
          setDetail(cached);
          setSupplementError(false);
          return;
        }
      }
      setSupplementLoading(true);
      setSupplementError(false);
      try {
        const dRes = await fetch(
          `/api/hotel/frontdesk/rooms/${room.id}?slug=${encodeURIComponent(slug)}&fromBoard=1`,
        );
        const d = (await dRes.json()) as RoomDetailPayload & { error?: string };
        if (!d.error) {
          setDetail(d);
          setCachedRoomDetail(room.id, d);
        } else {
          setDetail(null);
          setSupplementError(true);
        }
      } catch {
        setDetail(null);
        setSupplementError(true);
      } finally {
        setSupplementLoading(false);
      }
    },
    [room, slug],
  );

  const loadHistory = useCallback(async () => {
    if (!room || historyRequested) return;
    setHistoryRequested(true);
    setHistoryLoading(true);
    try {
      const hRes = await fetch(
        `/api/hotel/frontdesk/rooms/${room.id}/history?slug=${encodeURIComponent(slug)}`,
      );
      const h = await hRes.json();
      setHistory(h);
    } catch {
      setHistory({ audit: [] });
    } finally {
      setHistoryLoading(false);
    }
  }, [room, slug, historyRequested]);

  const loadAssets = useCallback(async () => {
    if (!room || assetsRequested) return;
    setAssetsRequested(true);
    try {
      const aRes = await fetch(
        `/api/hotel/frontdesk/rooms/${room.id}/assets?slug=${encodeURIComponent(slug)}`,
      );
      const a = await aRes.json();
      setAssets(a.assets ?? []);
    } catch {
      setAssets([]);
    }
  }, [room, slug, assetsRequested]);

  const load = useCallback(
    async (force = false) => {
      if (!room) return;
      if (force) invalidateRoomDetail(room.id);
      setHistoryRequested(false);
      setHistory(null);
      setAssetsRequested(false);
      setAssets([]);
      await loadSupplement(force);
    },
    [room, loadSupplement],
  );

  useEffect(() => {
    if (!open || !room) return;
    setDetail(null);
    setHistory(null);
    setAssets([]);
    setStatusError(null);
    setSupplementError(false);
    setHistoryRequested(false);
    setAssetsRequested(false);
    void loadSupplement();
  }, [open, room?.id, loadSupplement]);

  useEffect(() => {
    if (!detail || !capabilities.canEditNotes || assetsRequested) return;
    void loadAssets();
  }, [detail, capabilities.canEditNotes, assetsRequested, loadAssets]);

  async function saveNote() {
    if (!room || !noteBody.trim() || !capabilities.canEditNotes) return;
    const res = await fetch(`/api/hotel/frontdesk/rooms/${room.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, body: noteBody.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toastError("Could not save note", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Note saved");
    setNoteBody("");
    void load(true);
  }

  async function patchNote(noteId: string) {
    if (!room || !editingNoteBody.trim() || !capabilities.canEditNotes) return;
    const res = await fetch(`/api/hotel/frontdesk/rooms/${room.id}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, noteId, body: editingNoteBody.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toastError("Could not update note", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Note updated");
    setEditingNoteId(null);
    setEditingNoteBody("");
    void load(true);
  }

  async function addAsset() {
    if (!room || !assetLabel.trim() || !capabilities.canEditNotes) return;
    const res = await fetch(`/api/hotel/frontdesk/rooms/${room.id}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, label: assetLabel.trim(), assetType }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toastError("Could not add asset", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Asset added");
    setAssetLabel("");
    void load(true);
  }

  async function removeAsset(assetId: string) {
    if (!room || !capabilities.canEditNotes) return;
    const res = await fetch(`/api/hotel/frontdesk/rooms/${room.id}/assets`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, assetId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toastError("Could not remove asset", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Asset removed");
    void load(true);
  }

  const boardRoomForStays = detail?.room ?? room;
  const stay = boardRoomForStays?.stay ?? boardRoomForStays?.reservedStay;
  const effectiveUnitStatus = detail?.unitStatus ?? room?.unitStatus ?? "";

  async function logIncident() {
    if (!room || !incidentDesc.trim() || !capabilities.canLogIncidents) return;
    const res = await fetch(`/api/hotel/frontdesk/rooms/${room.id}/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        incidentType,
        description: incidentDesc.trim(),
        reservationId: stay?.reservationId,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toastError("Could not log incident", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Incident logged");
    setIncidentDesc("");
    void load(true);
  }

  async function changeUnitStatus(nextStatus: string) {
    if (!room) return;
    if (nextStatus === effectiveUnitStatus) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      const res = await fetch("/api/hotel/frontdesk/room-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, roomCode: room.roomCode, status: nextStatus }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msg = j.error ?? "Could not update status.";
        setStatusError(msg);
        toastError("Could not update room status", msg);
        return;
      }
      toastSuccess("Room status updated");
      router.refresh();
      await load(true);
    } finally {
      setStatusSaving(false);
    }
  }

  const headerRoom = room;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex h-full w-full flex-col gap-0 overflow-hidden p-0",
          "data-[side=right]:w-[min(720px,94vw)] data-[side=right]:max-w-none data-[side=right]:sm:max-w-none",
        )}
      >
        <SheetHeader className="shrink-0 border-b bg-white px-6 py-5 pr-14">
          {headerRoom ? (
            <>
              <div className="flex items-center gap-2">
                <SheetTitle className="text-xl font-bold">Room {headerRoom.roomCode}</SheetTitle>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold text-white",
                    ROOM_STATUS_CELL_CLASS[headerRoom.displayStatus].split(" ")[0],
                  )}
                >
                  {headerRoom.statusShortLabel}
                </span>
              </div>
              <SheetDescription>
                Floor {headerRoom.floor} · {headerRoom.roomTypeName}
              </SheetDescription>
            </>
          ) : null}
        </SheetHeader>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-6">
          {supplementError && !detail && room ? (
            <p className="mb-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-500">
              Some room details could not be refreshed. Occupancy info below is from the live board.
            </p>
          ) : null}

          {room ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Room information</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Room number</p>
                    <p className="font-medium">{room.roomCode}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Floor</p>
                    <p className="font-medium">{room.floor}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Type</p>
                    <p className="font-medium">{detail?.roomType.name ?? room.roomTypeName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Bed / basis</p>
                    <div className="font-medium">
                      {supplementLoading && !detail ? (
                        <Skeleton className="inline-block h-4 w-20" />
                      ) : (
                        (detail?.roomType.bedType ?? "—")
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Capacity</p>
                    <div className="font-medium">
                      {supplementLoading && !detail ? (
                        <Skeleton className="inline-block h-4 w-10" />
                      ) : (
                        (detail?.roomType.capacity ?? "—")
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Unit status</p>
                    <p className="font-medium">{effectiveUnitStatus.replace(/_/g, " ")}</p>
                  </div>
                  {capabilities.canChangeRoomStatus ? (
                    <div className="sm:col-span-2">
                      <label htmlFor="room-unit-status" className="text-xs text-slate-500">
                        Change operational status
                      </label>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <select
                          id="room-unit-status"
                          className="h-9 min-w-[12rem] rounded-lg border border-input bg-white px-2 text-sm"
                          disabled={statusSaving || (supplementLoading && !detail)}
                          value={effectiveUnitStatus}
                          onChange={(e) => void changeUnitStatus(e.target.value)}
                        >
                          {unitStatusSelectOptions(effectiveUnitStatus, Boolean(room.stay)).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {statusSaving ? (
                          <span className="text-xs text-slate-500">Saving…</span>
                        ) : null}
                      </div>
                      {statusError ? <p className="mt-1 text-xs text-red-600">{statusError}</p> : null}
                      {room.stay ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Guest is checked in — only housekeeping-related statuses (or keeping the current value) are
                          available until checkout.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Housekeeping</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Status</p>
                    <p className="font-medium">
                      {detail?.housekeepingDetail?.status?.replace(/_/g, " ") ??
                        boardRoomForStays?.housekeeping?.status?.replace(/_/g, " ") ??
                        "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Priority</p>
                    <p className="font-medium">
                      {detail?.housekeepingDetail?.priorityLevel ??
                        boardRoomForStays?.housekeeping?.priorityLevel ??
                        "normal"}
                    </p>
                  </div>
                  {detail?.housekeepingDetail?.dueBy ? (
                    <div>
                      <p className="text-xs text-slate-500">Due by</p>
                      <p className="font-medium">
                        {formatBoardDateTime(detail.housekeepingDetail.dueBy)}
                      </p>
                    </div>
                  ) : null}
                  {detail?.housekeepingDetail?.updatedAt ? (
                    <div>
                      <p className="text-xs text-slate-500">Last updated</p>
                      <p className="font-medium">
                        {formatBoardDateTime(detail.housekeepingDetail.updatedAt)}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Room flags</CardTitle>
                </CardHeader>
                <CardContent>
                  <FrontDeskRoomFlagsEditor
                    slug={slug}
                    roomCode={room.roomCode}
                    flags={boardRoomForStays?.roomFlags ?? room.roomFlags}
                  />
                </CardContent>
              </Card>

              {stay ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Current occupancy</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <p className="text-slate-600">
                      Party of {stay.partySize} ({stay.adults} adult{stay.adults === 1 ? "" : "s"}
                      {stay.childrenCount > 0
                        ? `, ${stay.childrenCount} child${stay.childrenCount === 1 ? "" : "ren"}`
                        : ""}
                      )
                    </p>
                    <div className="space-y-3">
                      {stay.partyGuests.map((guest) => (
                        <div
                          key={guest.id}
                          className="rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <p className="font-semibold text-slate-900">
                            {guest.displayName}
                            <span className="ml-2 text-xs font-normal capitalize text-slate-500">
                              {guest.relationship}
                              {guest.isPrimary ? " · lead" : ""}
                            </span>
                          </p>
                          <p className="text-slate-600">{guest.phone}</p>
                          <p className="text-slate-600">{guest.email}</p>
                          <p className="text-slate-600">
                            {guest.nationality} · {guest.idType} {guest.idNumber}
                          </p>
                          <p className="text-xs text-slate-500">
                            DOB {guest.dateOfBirth}
                            {guest.idExpiryDate ? ` · ID exp. ${guest.idExpiryDate}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-slate-600">Ref {stay.confirmationCode}</p>
                    <p className="text-slate-600">{stay.bookingSourceLabel}</p>
                    <p className="text-slate-600">
                      Arrival {formatBoardDateTime(stay.arrivalAt)} · Departure{" "}
                      {formatBoardDateTime(stay.departureAt)}
                    </p>
                    {stay.checkInAt ? (
                      <p className="text-slate-600">Checked in {formatBoardDateTime(stay.checkInAt)}</p>
                    ) : null}
                    <p className="text-slate-600">{stay.paymentLabel}</p>
                    <p className="text-slate-600">
                      Rate {formatPricingAmount(stay.ratePerNight, currency)} / night · Room charges{" "}
                      {formatPricingAmount(stay.totalRoomCharges, currency)}
                    </p>
                    {stay.isVip ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">VIP</span>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {boardRoomForStays?.stay ? (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-orange-600 hover:bg-orange-700"
                          onClick={() => {
                            onOpenChange(false);
                            openCheckoutDialog({
                              roomCode: room.roomCode,
                              reservationId: stay.reservationId,
                            });
                          }}
                        >
                          <LogOut className="mr-1.5 h-3.5 w-3.5" />
                          Check out guest
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/hms/${slug}/frontdesk/folio?reservationId=${encodeURIComponent(stay.reservationId)}`}
                        >
                          Open folio
                        </Link>
                      </Button>
                      {boardRoomForStays?.reservedStay && !boardRoomForStays.stay ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/hms/${slug}/frontdesk/arrivals`}>Open arrivals</Link>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-6 text-sm text-slate-500">No guest in this room.</CardContent>
                </Card>
              )}

              {supplementLoading && !detail ? <InlineCardSkeleton title="Active blocks" /> : null}

              {detail && detail.blocks.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Active blocks</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {detail.blocks.map((b) => (
                      <div key={b.id} className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                        <p className="font-medium">{b.reason}</p>
                        <p className="text-xs text-slate-600">
                          {b.block_type} · {formatBoardDateTime(b.start_at)}
                          {b.end_at ? ` → ${formatBoardDateTime(b.end_at)}` : ""}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              {detail && detail.connectingRoomCodes.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Connecting rooms</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">{detail.connectingRoomCodes.join(", ")}</CardContent>
                </Card>
              ) : null}

              {supplementLoading && !detail && capabilities.canLogIncidents ? (
                <InlineCardSkeleton title="Incidents" />
              ) : null}

              {detail && (detail.incidents.length > 0 || capabilities.canLogIncidents) ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Incidents</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <ul className="space-y-2">
                      {detail.incidents.map((i) => (
                        <li key={i.id} className="rounded-lg border bg-white p-2">
                          <p className="font-medium">{i.incidentType}</p>
                          <p className="text-slate-600">{i.description}</p>
                          <p className="text-xs text-slate-500">
                            {i.status} · {new Date(i.createdAt).toLocaleString()}
                          </p>
                          {capabilities.canLogIncidents && i.status !== "resolved" && i.status !== "closed" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="mt-1 h-7 text-xs"
                              onClick={async () => {
                                if (!room) return;
                                const res = await fetch(`/api/hotel/frontdesk/rooms/${room.id}/incidents`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    slug,
                                    incidentId: i.id,
                                    status: "resolved",
                                  }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) {
                                  toastError("Could not resolve incident", data.error ?? "Try again.");
                                  return;
                                }
                                toastSuccess("Incident resolved");
                                void load(true);
                              }}
                            >
                              Mark resolved
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {capabilities.canLogIncidents ? (
                      <div className="space-y-2 border-t pt-3">
                        <select
                          className="h-9 w-full rounded-lg border border-input px-2 text-sm"
                          value={incidentType}
                          onChange={(e) => setIncidentType(e.target.value)}
                        >
                          <option value="maintenance">Maintenance</option>
                          <option value="damage">Damage</option>
                          <option value="noise">Noise</option>
                          <option value="safety">Safety</option>
                          <option value="other">Other</option>
                        </select>
                        <textarea
                          className="min-h-[60px] w-full rounded-lg border border-input px-3 py-2 text-sm"
                          placeholder="Describe incident…"
                          value={incidentDesc}
                          onChange={(e) => setIncidentDesc(e.target.value)}
                        />
                        <Button type="button" size="sm" onClick={logIncident}>
                          Log incident
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {capabilities.canEditNotes || assets.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Room assets</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-2 text-sm">
                      {assets.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2"
                        >
                          <span>
                            <span className="font-medium">{a.label}</span>
                            <span className="ml-2 text-xs text-slate-500">{a.assetType}</span>
                            {a.serialNumber ? (
                              <span className="ml-1 text-xs text-slate-400">· {a.serialNumber}</span>
                            ) : null}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-xs capitalize text-slate-600">{a.condition}</span>
                            {capabilities.canEditNotes ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => removeAsset(a.id)}
                              >
                                Remove
                              </Button>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {capabilities.canEditNotes ? (
                      <div className="flex flex-wrap gap-2 border-t pt-3">
                        <select
                          className="h-9 rounded-lg border border-input px-2 text-sm"
                          value={assetType}
                          onChange={(e) => setAssetType(e.target.value)}
                        >
                          <option value="tv">TV</option>
                          <option value="minibar">Minibar</option>
                          <option value="safe">Safe</option>
                          <option value="phone">Phone</option>
                          <option value="ac">A/C</option>
                          <option value="other">Other</option>
                        </select>
                        <input
                          className="min-w-[8rem] flex-1 rounded-lg border border-input px-3 py-1.5 text-sm"
                          placeholder="Asset label"
                          value={assetLabel}
                          onChange={(e) => setAssetLabel(e.target.value)}
                        />
                        <Button type="button" size="sm" onClick={addAsset}>
                          Add asset
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {capabilities.canEditNotes ? (
                supplementLoading && !detail ? (
                  <InlineCardSkeleton title="Room notes" />
                ) : detail ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Room notes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-2 text-sm">
                      {detail.notes.map((n) => (
                        <li key={n.id} className="rounded-lg border bg-white p-2">
                          {editingNoteId === n.id ? (
                            <div className="space-y-2">
                              <textarea
                                className="min-h-[60px] w-full rounded-lg border border-input px-2 py-1.5 text-sm"
                                value={editingNoteBody}
                                onChange={(e) => setEditingNoteBody(e.target.value)}
                              />
                              <div className="flex gap-2">
                                <Button type="button" size="sm" onClick={() => patchNote(n.id)}>
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingNoteId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p>{n.body}</p>
                              <p className="text-xs text-slate-500">
                                {n.authorName} · {new Date(n.createdAt).toLocaleString()}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="mt-1 h-7 text-xs"
                                onClick={() => {
                                  setEditingNoteId(n.id);
                                  setEditingNoteBody(n.body);
                                }}
                              >
                                Edit
                              </Button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                    <textarea
                      className="min-h-[72px] w-full rounded-lg border border-input px-3 py-2 text-sm"
                      placeholder="Add internal note…"
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                    />
                    <Button type="button" size="sm" onClick={saveNote}>
                      Save note
                    </Button>
                  </CardContent>
                </Card>
                ) : null
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {(
                      [
                        ["audit", "Audit"],
                        ["guests", "Past guests"],
                        ["hk", "HK"],
                        ["incidents", "Incidents"],
                      ] as const
                    ).map(([key, label]) => (
                      <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant={historyTab === key ? "default" : "outline"}
                        onClick={() => {
                          setHistoryTab(key);
                          void loadHistory();
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <ul className="max-h-48 space-y-2 overflow-y-auto text-xs text-slate-600">
                    {!historyRequested ? (
                      <li className="text-slate-500">Choose a tab above to load history.</li>
                    ) : null}
                    {historyLoading ? (
                      <li className="text-slate-500">Loading history…</li>
                    ) : null}
                    {historyTab === "audit"
                      ? (history?.audit ?? []).map((a) => (
                          <li key={a.id} className="border-l-2 border-slate-200 pl-3">
                            {a.message}
                          </li>
                        ))
                      : null}
                    {historyTab === "guests"
                      ? (history?.pastStays ?? []).map((s) => (
                          <li key={s.id} className="border-l-2 border-slate-200 pl-3">
                            {s.confirmationCode} · {s.status} · {formatBoardDateTime(s.departureAt)}
                          </li>
                        ))
                      : null}
                    {historyTab === "hk"
                      ? (history?.hkCleans ?? []).map((h) => (
                          <li key={h.id} className="border-l-2 border-slate-200 pl-3">
                            {h.status.replace(/_/g, " ")} · {h.priorityLevel ?? "normal"} ·{" "}
                            {formatBoardDateTime(h.updatedAt)}
                          </li>
                        ))
                      : null}
                    {historyTab === "incidents"
                      ? (history?.incidents ?? detail?.incidents ?? []).map((i) => (
                          <li key={i.id} className="border-l-2 border-slate-200 pl-3">
                            {i.incidentType}: {i.description}
                          </li>
                        ))
                      : null}
                  </ul>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t bg-white px-6 py-4">
          {room ? (
          <div className="flex flex-wrap gap-2">
            {capabilities.canAssignRoom ? (
              <Button type="button" size="sm" onClick={() => onOpenOp("change-assignment")}>
                Assign / change
              </Button>
            ) : null}
            {capabilities.canMoveGuest && boardRoomForStays?.stay ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onOpenOp("move")}>
                Move guest
              </Button>
            ) : null}
            {capabilities.canBlockRoom ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onOpenOp("block")}>
                Block
              </Button>
            ) : null}
            {capabilities.canPriorityClean ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onOpenOp("priority-clean")}>
                Priority clean
              </Button>
            ) : null}
            {capabilities.canRemoteUnlock ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onOpenOp("unlock")}>
                Remote unlock
              </Button>
            ) : null}
            {capabilities.canKeyReissue ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onOpenOp("key-reissue")}>
                Key reissue
              </Button>
            ) : null}
          </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
