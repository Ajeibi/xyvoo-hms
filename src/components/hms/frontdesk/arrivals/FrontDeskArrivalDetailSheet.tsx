"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BedDouble,
  CalendarRange,
  CircleUser,
  ClipboardList,
  CreditCard,
  ExternalLink,
  History,
  Loader2,
  StickyNote,
} from "lucide-react";
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
import { toastError, toastSuccess } from "@/lib/app-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import type { ArrivalDetailPayload } from "@/lib/hms/arrivals-workbench";
import type { ArrivalsRoleCapabilities } from "@/lib/hms/arrivals-rbac";
import {
  PAYMENT_DOT_CLASS,
  PAYMENT_STATUS_LABEL,
} from "@/components/hms/frontdesk/board/payment-styles";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { READINESS_LABEL } from "./FrontDeskAssignRoomPicker";
import { cn } from "@/lib/utils";

type GuestRequest = {
  id: string;
  requestType: string;
  department: string;
  status: string;
  notes: string | null;
  createdAt: string;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-blue-50 text-blue-800 ring-blue-200/80",
  checked_in: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
  checked_out: "bg-slate-100 text-slate-700 ring-slate-200/80",
  no_show: "bg-amber-50 text-amber-900 ring-amber-200/80",
  cancelled: "bg-red-50 text-red-800 ring-red-200/80",
};

function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset",
        STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 ring-slate-200/80",
      )}
    >
      {label}
    </span>
  );
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value || "—"}</dd>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="shadow-none ring-slate-200/80">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon className="h-4 w-4" />
          </span>
          <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

export function FrontDeskArrivalDetailSheet({
  slug,
  reservationId,
  open,
  onOpenChange,
  onCheckIn,
  onAssignRoom,
  onRefresh,
  capabilities,
  currency,
}: {
  slug: string;
  reservationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckIn: () => void;
  onAssignRoom: () => void;
  onRefresh: () => void;
  capabilities: ArrivalsRoleCapabilities;
  currency: string;
}) {
  const [detail, setDetail] = useState<ArrivalDetailPayload | null>(null);
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guestRemarks, setGuestRemarks] = useState("");
  const [roomPreferences, setRoomPreferences] = useState("");
  const [vipNotes, setVipNotes] = useState("");
  const [newRequestType, setNewRequestType] = useState("");
  const [requestDepartment, setRequestDepartment] = useState("front_desk");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [penaltyAmount, setPenaltyAmount] = useState("");

  const load = useCallback(async () => {
    if (!reservationId) return;
    setLoading(true);
    try {
      const [detailRes, reqRes] = await Promise.all([
        fetch(`/api/hotel/frontdesk/arrivals/${reservationId}?slug=${encodeURIComponent(slug)}`),
        fetch(
          `/api/hotel/frontdesk/arrivals/${reservationId}/requests?slug=${encodeURIComponent(slug)}`,
        ),
      ]);
      const d = await detailRes.json();
      if (d.error) throw new Error(d.error);
      setDetail(d);
      setGuestRemarks(d.reservation.guestRemarks ?? "");
      setRoomPreferences(d.reservation.roomPreferencesText ?? "");
      setVipNotes(d.reservation.vipNotes ?? "");
      const r = await reqRes.json();
      setRequests(r.requests ?? []);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [reservationId, slug]);

  useEffect(() => {
    if (open && reservationId) load();
  }, [open, reservationId, load]);

  async function saveNotes() {
    if (!reservationId || !capabilities.canEditNotes) return;
    setSaving(true);
    const res = await fetch(`/api/hotel/frontdesk/arrivals/${reservationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, guestRemarks, roomPreferencesText: roomPreferences, vipNotes }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      toastError("Could not save notes", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Arrival notes saved");
    onRefresh();
    load();
  }

  async function addRequest() {
    if (!reservationId || !newRequestType.trim() || !capabilities.canManageRequests) return;
    setRequestError(null);
    const res = await fetch(`/api/hotel/frontdesk/arrivals/${reservationId}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        requestType: newRequestType.trim(),
        department: requestDepartment,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      const msg = json.error ?? "Could not add request.";
      setRequestError(msg);
      toastError("Could not add request", msg);
      return;
    }
    toastSuccess("Request added");
    setNewRequestType("");
    load();
  }

  async function fulfillRequest(requestId: string) {
    if (!reservationId) return;
    const res = await fetch(`/api/hotel/frontdesk/arrivals/${reservationId}/requests`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, requestId, status: "completed" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not complete request", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Request completed");
    load();
  }

  async function markNoShow() {
    if (!reservationId || !capabilities.canMarkNoShow) return;
    const amount = penaltyAmount ? Number.parseFloat(penaltyAmount) : undefined;
    const res = await fetch(`/api/hotel/frontdesk/arrivals/${reservationId}/no-show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, penaltyAmount: amount, releaseRoom: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not mark no-show", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Marked as no-show");
    onRefresh();
    onOpenChange(false);
  }

  async function reopenNoShow() {
    if (!reservationId) return;
    const res = await fetch(`/api/hotel/frontdesk/arrivals/${reservationId}/no-show`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, action: "reopen" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not reopen arrival", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Arrival reopened");
    onRefresh();
    load();
  }

  const r = detail?.reservation;
  const g = detail?.guest;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex h-full w-full flex-col gap-0 overflow-hidden border-l border-slate-200 bg-slate-50/40 p-0",
          "data-[side=right]:w-[min(720px,94vw)] data-[side=right]:max-w-none data-[side=right]:sm:max-w-none",
        )}
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-slate-200 bg-white px-6 py-5 pr-14">
          {loading && !detail ? (
            <>
              <Skeleton className="h-7 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-lg font-bold tracking-tight text-slate-900">
                  {r?.confirmationCode ?? "Arrival"}
                </SheetTitle>
                {r ? <StatusPill status={r.status} /> : null}
                {r?.isVip ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase text-amber-900">
                    VIP
                  </span>
                ) : null}
              </div>
              <SheetDescription className="mt-1 text-base font-medium text-slate-700">
                {g?.displayName ?? "Guest details"}
              </SheetDescription>
              {r ? (
                <p className="mt-2 text-sm text-slate-500">
                  {r.bookingSourceLabel} · Folio {r.folioNumber}
                </p>
              ) : null}
            </>
          )}
        </SheetHeader>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loading && !detail ? <DetailSkeleton /> : null}

          {!loading && !detail && reservationId ? (
            <p className="p-6 text-sm text-slate-500">Could not load reservation details.</p>
          ) : null}

          {detail && r ? (
            <div className="space-y-4 p-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard icon={CircleUser} title="Guest">
                  {g ? (
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <DetailField label="Name" value={g.displayName} className="sm:col-span-2" />
                      <DetailField label="Phone" value={g.phone} />
                      <DetailField label="Email" value={g.email} />
                      <DetailField label="Nationality" value={g.nationality} />
                      <DetailField
                        label="ID"
                        value={
                          g.idNumber
                            ? `${g.idType ?? "ID"}: ${g.idNumber}${g.idExpiryDate ? ` (exp. ${g.idExpiryDate})` : ""}`
                            : null
                        }
                      />
                      {g.gender ? <DetailField label="Gender" value={g.gender} /> : null}
                      {g.dateOfBirth ? <DetailField label="Date of birth" value={g.dateOfBirth} /> : null}
                    </dl>
                  ) : (
                    <p className="text-sm text-slate-500">No guest profile linked.</p>
                  )}
                  {g?.id ? (
                    <Button asChild variant="outline" size="sm" className="mt-4 w-full sm:w-auto">
                      <Link href={`/hms/${slug}/guests/${g.id}`}>
                        Open guest profile
                        <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                </SectionCard>

                <SectionCard icon={CalendarRange} title="Stay">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <DetailField
                      label="Arrival"
                      value={new Date(r.arrivalAt).toLocaleString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}
                    />
                    <DetailField
                      label="Departure"
                      value={new Date(r.departureAt).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    />
                    <DetailField label="Nights" value={String(r.nights)} />
                    <DetailField
                      label="Party"
                      value={`${r.adults} adult${r.adults === 1 ? "" : "s"}${r.childrenCount > 0 ? `, ${r.childrenCount} children` : ""}`}
                    />
                    <DetailField
                      label="Booked"
                      value={new Date(r.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      className="sm:col-span-2"
                    />
                    <DetailField label="Market" value={r.marketSegment} />
                    <DetailField label="Bill to" value={r.billToAccount} />
                  </dl>
                </SectionCard>
              </div>

              <SectionCard
                icon={BedDouble}
                title="Room"
                action={
                  capabilities.canAssignRoom && r.status === "confirmed" ? (
                    <Button type="button" size="sm" variant="outline" onClick={onAssignRoom}>
                      Assign room
                    </Button>
                  ) : null
                }
              >
                <dl className="grid gap-4 sm:grid-cols-3">
                  <DetailField
                    label="Assignment"
                    value={r.roomCode ? `Room ${r.roomCode}` : "Not assigned"}
                  />
                  <DetailField label="Type" value={r.roomTypeCode} />
                  <DetailField label="Floor" value={r.floor != null ? String(r.floor) : null} />
                  {r.unitStatus ? <DetailField label="Unit status" value={r.unitStatus} /> : null}
                  {r.roomReadiness ? (
                    <DetailField
                      label="Housekeeping"
                      value={READINESS_LABEL[r.roomReadiness] ?? r.roomReadiness}
                    />
                  ) : null}
                </dl>
                {(r.roomPreferencesText || r.dietaryNotes || r.accessibilityNotes) ? (
                  <>
                    <Separator className="my-4" />
                    <dl className="grid gap-3">
                      {r.roomPreferencesText ? (
                        <DetailField label="Room preferences" value={r.roomPreferencesText} />
                      ) : null}
                      {r.dietaryNotes ? <DetailField label="Dietary" value={r.dietaryNotes} /> : null}
                      {r.accessibilityNotes ? (
                        <DetailField label="Accessibility" value={r.accessibilityNotes} />
                      ) : null}
                    </dl>
                  </>
                ) : null}
              </SectionCard>

              {capabilities.canViewFolioFinancials ? (
                <SectionCard
                  icon={CreditCard}
                  title="Financial"
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/hms/${slug}/frontdesk/folio?code=${encodeURIComponent(r.confirmationCode)}`}
                      >
                        Open folio
                        <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  }
                >
                  <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200/80">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        PAYMENT_DOT_CLASS[detail.folio.displayStatus],
                      )}
                    />
                    <span className="text-sm font-semibold text-slate-900">
                      {PAYMENT_STATUS_LABEL[detail.folio.displayStatus]}
                    </span>
                    <span className="text-sm text-slate-500">·</span>
                    <span className="text-sm text-slate-600">
                      Balance{" "}
                      <span className="font-semibold text-slate-900">{detail.folio.balanceFormatted}</span>
                    </span>
                    <span className="text-sm text-slate-500">·</span>
                    <span className="text-sm text-slate-600">
                      Room charges {formatPricingAmount(r.totalRoomCharges, currency)}
                    </span>
                  </div>

                  {detail.folio.lines.length > 0 ? (
                    <div className="thin-scrollbar mt-4 max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">When</th>
                            <th className="px-3 py-2">Description</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detail.folio.lines
                            .filter((l) => !l.voided_at)
                            .map((line) => (
                              <tr key={line.id}>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                                  {new Date(line.created_at).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                    timeZone: "UTC",
                                  })}
                                </td>
                                <td className="px-3 py-2 text-slate-800">
                                  {line.description ?? line.kind}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                                  {formatPricingAmount(line.amount, currency)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No folio lines posted yet.</p>
                  )}
                </SectionCard>
              ) : null}

              {capabilities.canEditNotes ? (
                <SectionCard icon={StickyNote} title="Notes">
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Guest remarks
                      </label>
                      <textarea
                        className="flex min-h-[72px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        placeholder="Visible on registration"
                        value={guestRemarks}
                        onChange={(e) => setGuestRemarks(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Room preferences
                      </label>
                      <textarea
                        className="flex min-h-[72px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        value={roomPreferences}
                        onChange={(e) => setRoomPreferences(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        VIP notes (internal)
                      </label>
                      <textarea
                        className="flex min-h-[72px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        value={vipNotes}
                        onChange={(e) => setVipNotes(e.target.value)}
                      />
                    </div>
                    <Button type="button" size="sm" onClick={() => saveNotes()} disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save notes"
                      )}
                    </Button>
                  </div>
                </SectionCard>
              ) : null}

              {capabilities.canManageRequests ? (
                <SectionCard icon={ClipboardList} title="Special requests">
                  <ul className="space-y-2">
                    {requests.length === 0 ? (
                      <li className="text-sm text-slate-500">No requests logged.</li>
                    ) : (
                      requests.map((req) => (
                        <li
                          key={req.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{req.requestType}</p>
                            <p className="text-xs text-slate-500">
                              {req.department.replace(/_/g, " ")} · {req.status}
                            </p>
                          </div>
                          {req.status !== "completed" && req.status !== "cancelled" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => fulfillRequest(req.id)}
                            >
                              Mark complete
                            </Button>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                  {requestError ? <p className="mt-2 text-xs text-red-600">{requestError}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <select
                      className="h-9 cursor-pointer rounded-lg border border-input bg-white px-3 text-sm"
                      value={requestDepartment}
                      onChange={(e) => setRequestDepartment(e.target.value)}
                    >
                      <option value="front_desk">Front desk</option>
                      <option value="housekeeping">Housekeeping</option>
                      <option value="f_and_b">F&B</option>
                    </select>
                    <Input
                      className="min-w-[160px] flex-1"
                      placeholder="e.g. Early check-in, cot"
                      value={newRequestType}
                      onChange={(e) => setNewRequestType(e.target.value)}
                    />
                    <Button type="button" size="sm" onClick={() => addRequest()}>
                      Add request
                    </Button>
                  </div>
                </SectionCard>
              ) : null}

              <SectionCard icon={History} title="Activity">
                <ul className="max-h-56 space-y-3 overflow-y-auto pr-1">
                  {(detail.activityTimeline ?? detail.auditTimeline).map((a) => (
                    <li key={a.id} className="relative border-l-2 border-slate-200 pl-4 text-sm">
                      <p className="text-slate-800">{a.message}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(a.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </li>
                  ))}
                  {(detail.activityTimeline ?? detail.auditTimeline).length === 0 ? (
                    <li className="text-sm text-slate-500">No activity yet.</li>
                  ) : null}
                </ul>
              </SectionCard>
            </div>
          ) : null}
        </div>

        {detail && r ? (
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {capabilities.canCheckIn && r.status === "confirmed" ? (
                <Button type="button" className="min-w-[120px]" onClick={onCheckIn}>
                  Check in guest
                </Button>
              ) : null}
              {capabilities.canAssignRoom && r.status === "confirmed" ? (
                <Button type="button" variant="outline" onClick={onAssignRoom}>
                  Assign room
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href={`/hms/${slug}/frontdesk/folio?code=${encodeURIComponent(r.confirmationCode)}`}>
                  Folio
                </Link>
              </Button>
            </div>

            {capabilities.canMarkNoShow && r.status === "confirmed" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <Input
                  type="number"
                  min={0}
                  placeholder="No-show penalty"
                  className="h-9 w-36"
                  value={penaltyAmount}
                  onChange={(e) => setPenaltyAmount(e.target.value)}
                />
                <Button type="button" variant="destructive" size="sm" onClick={() => markNoShow()}>
                  Mark no-show
                </Button>
              </div>
            ) : null}

            {r.status === "no_show" ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => reopenNoShow()}>
                  Reopen reservation
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
