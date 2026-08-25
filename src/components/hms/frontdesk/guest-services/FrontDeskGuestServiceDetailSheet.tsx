"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GuestServicesRoleCapabilities } from "@/lib/hms/guest-services-rbac";
import { GUEST_REQUEST_DEPARTMENTS, GUEST_REQUEST_DEPARTMENT_LABELS, GUEST_REQUEST_PRIORITIES } from "@/lib/hms/guest-services";
import { toastError, toastSuccess } from "@/lib/app-toast";

type DetailPayload = {
  request: Record<string, unknown>;
  reservation: Record<string, unknown> | null;
  roomCode: string | null;
  notes: { id: string; body: string; visibility: string; author_user_id: string | null; created_at: string }[];
  events: {
    id: string;
    action: string;
    payload: Record<string, unknown>;
    actor_user_id: string | null;
    created_at: string;
    actorName: string;
  }[];
};

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type AssignableStaffMember = { userId: string; name: string; role: string };

export function FrontDeskGuestServiceDetailSheet({
  slug,
  requestId,
  open,
  onOpenChange,
  capabilities,
  onUpdated,
}: {
  slug: string;
  requestId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capabilities: GuestServicesRoleCapabilities;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"front_desk" | "department" | "manager">("front_desk");
  const [folioAmount, setFolioAmount] = useState("");
  const [folioDesc, setFolioDesc] = useState("Guest service");
  const [complimentary, setComplimentary] = useState(false);
  const [assignableStaff, setAssignableStaff] = useState<AssignableStaffMember[]>([]);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/hotel/frontdesk/guest-services/${requestId}?slug=${encodeURIComponent(slug)}`,
      );
      const json = await res.json();
      if (!json.error) setDetail(json);
      else setDetail(null);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [requestId, slug]);

  useEffect(() => {
    if (!open || !capabilities.canCreate) {
      setAssignableStaff([]);
      return;
    }
    void fetch(`/api/hotel/frontdesk/guest-services/assignable-staff?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((j: { staff?: AssignableStaffMember[]; error?: string }) => {
        if (!j.error && Array.isArray(j.staff)) setAssignableStaff(j.staff);
        else setAssignableStaff([]);
      })
      .catch(() => setAssignableStaff([]));
  }, [open, slug, capabilities.canCreate]);

  useEffect(() => {
    if (open && requestId) void load();
  }, [open, requestId, load]);

  const req = detail?.request;
  const res = detail?.reservation;

  async function patch(updates: Record<string, unknown>) {
    if (!requestId || !capabilities.canUpdate || capabilities.readOnly) return;
    const res = await fetch(`/api/hotel/frontdesk/guest-services/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...updates }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not update request", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Request updated");
    onUpdated();
    void load();
  }

  async function addNote() {
    if (!requestId || !noteBody.trim() || !capabilities.canUpdate || capabilities.readOnly) return;
    const res = await fetch(`/api/hotel/frontdesk/guest-services/${requestId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, body: noteBody.trim(), visibility: noteVisibility }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not add note", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Note added");
    setNoteBody("");
    onUpdated();
    void load();
  }

  async function postFolio() {
    if (!requestId || !capabilities.canPostFolio || capabilities.readOnly) return;
    const amount = complimentary ? 0 : Number.parseFloat(folioAmount);
    if (!complimentary && (!Number.isFinite(amount) || amount <= 0)) return;
    const res = await fetch(`/api/hotel/frontdesk/guest-services/${requestId}/folio-charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        amount: complimentary ? 0 : amount,
        description: folioDesc.trim() || "Guest service",
        complimentary,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not post folio charge", data.error ?? "Try again.");
      return;
    }
    toastSuccess(complimentary ? "Complimentary charge posted" : "Folio charge posted");
    onUpdated();
    void load();
  }

  const guestEmbeds = res?.reservation_guests as
    | { is_primary: boolean; guests: { first_name?: string; last_name?: string; phone?: string } | null }[]
    | null;
  const primary = guestEmbeds?.find((e) => e.is_primary) ?? guestEmbeds?.[0];
  const g = primary?.guests;
  const guestName = g ? `${g.first_name ?? ""} ${g.last_name ?? ""}`.trim() : null;
  const guestPhone = g?.phone ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Service request</SheetTitle>
        </SheetHeader>
        <div className="thin-scrollbar flex-1 overflow-y-auto bg-slate-50/50 p-4">
          {loading || !req ? (
            <p className="text-sm text-slate-500">{loading ? "Loading…" : "No data."}</p>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Guest</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p className="font-semibold">{guestName ?? "—"}</p>
                  <p>Room {detail?.roomCode ?? "—"}</p>
                  <p>Phone {guestPhone ?? "—"}</p>
                  <p>Ref {String(res?.confirmation_code ?? "—")}</p>
                  <p>VIP {Boolean(res?.vip_flag) ? "Yes" : "No"}</p>
                  {res?.arrival_at && res?.departure_at ? (
                    <p className="text-xs text-slate-600">
                      Stay {new Date(String(res.arrival_at)).toLocaleDateString()} —{" "}
                      {new Date(String(res.departure_at)).toLocaleDateString()}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Request</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    <span className="text-slate-500">ID</span> {String(req.id).slice(0, 8)}…
                  </p>
                  <p>
                    <span className="text-slate-500">Category</span>{" "}
                    {String(req.service_category ?? "").replace(/_/g, " ")}
                  </p>
                  <p className="font-medium">{String(req.request_type)}</p>
                  <p>{String(req.details ?? req.notes ?? "—")}</p>
                  <p className="text-xs text-slate-500">
                    Created {new Date(String(req.created_at)).toLocaleString()}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Assignment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {capabilities.canUpdate && !capabilities.readOnly ? (
                    <>
                      {assignableStaff.length > 0 ? (
                        <div>
                          <p className="mb-1 text-xs font-medium text-slate-600">Assignee</p>
                          <select
                            className="h-9 w-full rounded-lg border border-input px-2 text-sm"
                            value={String(req.assigned_user_id ?? "")}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              const st = String(req.status);
                              const updates: Record<string, unknown> = { assignedUserId: v };
                              if (v && st === "pending") updates.status = "assigned";
                              void patch(updates);
                            }}
                          >
                            <option value="">Unassigned</option>
                            {assignableStaff.map((s) => (
                              <option key={s.userId} value={s.userId}>
                                {s.name} ({s.role})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-600">Status</p>
                        <select
                          className="h-9 w-full rounded-lg border border-input px-2 text-sm"
                          value={String(req.status)}
                          onChange={(e) => patch({ status: e.target.value })}
                        >
                          {[
                            "pending",
                            "assigned",
                            "in_progress",
                            "waiting",
                            "completed",
                            "cancelled",
                            "escalated",
                          ].map((s) => (
                            <option key={s} value={s}>
                              {s.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-600">Department</p>
                        <select
                          className="h-9 w-full rounded-lg border border-input px-2 text-sm"
                          value={String(req.department)}
                          onChange={(e) => patch({ department: e.target.value })}
                        >
                          {GUEST_REQUEST_DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>
                              {GUEST_REQUEST_DEPARTMENT_LABELS[d]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-600">Priority</p>
                        <select
                          className="h-9 w-full rounded-lg border border-input px-2 text-sm"
                          value={String(req.priority)}
                          onChange={(e) =>
                            patch({ priority: e.target.value })
                          }
                        >
                          {GUEST_REQUEST_PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      {req.assigned_at ? (
                        <p className="text-xs text-slate-600">
                          Assigned at: {new Date(String(req.assigned_at)).toLocaleString()}
                        </p>
                      ) : null}
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-600">Expected completion (SLA)</p>
                        <Input
                          type="datetime-local"
                          className="h-9"
                          value={
                            req.expected_completed_at
                              ? toDatetimeLocalValue(String(req.expected_completed_at))
                              : ""
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            void patch({
                              expectedCompletedAt: v ? new Date(v).toISOString() : null,
                            });
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <p>
                        {String(req.department)} · {String(req.status)}
                      </p>
                      {req.expected_completed_at ? (
                        <p className="text-xs text-slate-600">
                          SLA target: {new Date(String(req.expected_completed_at)).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Billing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>Billable: {String(req.billable)}</p>
                  <p>Folio line: {req.folio_line_id ? String(req.folio_line_id).slice(0, 8) + "…" : "—"}</p>
                  {capabilities.canPostFolio && !capabilities.readOnly && !req.folio_line_id && Boolean(req.billable) ? (
                    <div className="space-y-2 border-t pt-3">
                      <Input
                        placeholder="Amount"
                        type="number"
                        value={folioAmount}
                        onChange={(e) => setFolioAmount(e.target.value)}
                      />
                      <Input
                        placeholder="Description"
                        value={folioDesc}
                        onChange={(e) => setFolioDesc(e.target.value)}
                      />
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={complimentary}
                          onChange={(e) => setComplimentary(e.target.checked)}
                        />
                        Complimentary (zero charge)
                      </label>
                      <Button type="button" size="sm" onClick={postFolio}>
                        Post to folio
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Internal notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
                    {(detail?.notes ?? []).map((n) => (
                      <li key={n.id} className="rounded border bg-white p-2 text-xs">
                        <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">
                          {n.visibility.replace(/_/g, " ")}
                        </p>
                        <p>{n.body}</p>
                        <p className="text-slate-500">{new Date(n.created_at).toLocaleString()}</p>
                      </li>
                    ))}
                  </ul>
                  {capabilities.canUpdate && !capabilities.readOnly ? (
                    <div className="space-y-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-600">Visibility</p>
                        <select
                          className="h-9 w-full rounded-lg border border-input px-2 text-sm"
                          value={noteVisibility}
                          onChange={(e) =>
                            setNoteVisibility(e.target.value as "front_desk" | "department" | "manager")
                          }
                        >
                          <option value="front_desk">Front desk</option>
                          <option value="department">Department only</option>
                          {capabilities.canViewManagerNotes ? (
                            <option value="manager">Manager only</option>
                          ) : null}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <textarea
                          className="min-h-[60px] flex-1 rounded-lg border border-input px-2 py-1 text-sm"
                          value={noteBody}
                          onChange={(e) => setNoteBody(e.target.value)}
                          placeholder="Add note…"
                        />
                        <Button type="button" size="sm" onClick={addNote}>
                          Add
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="max-h-48 space-y-2 overflow-y-auto text-xs text-slate-600">
                    {(detail?.events ?? []).map((ev) => (
                      <li key={ev.id} className="border-l-2 border-slate-200 pl-2">
                        <span className="font-medium text-slate-800">{ev.actorName ?? "Staff"}</span> ·{" "}
                        <span className="font-medium">{ev.action}</span> ·{" "}
                        {new Date(ev.created_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
