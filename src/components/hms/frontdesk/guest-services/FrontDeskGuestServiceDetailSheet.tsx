"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConciergeBell, History, NotebookPen, Receipt, UserCog, UserRound } from "lucide-react";
import { HmsField, HmsIconBadge, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import type { HmsMeaning } from "@/components/hms/meaning";
import type { GuestServicesRoleCapabilities } from "@/lib/hms/guest-services-rbac";
import { GUEST_REQUEST_DEPARTMENTS, GUEST_REQUEST_DEPARTMENT_LABELS, GUEST_REQUEST_PRIORITIES } from "@/lib/hms/guest-services";
import { toastError, toastSuccess } from "@/lib/app-toast";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

function SheetSection({
  icon,
  meaning,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  meaning: HmsMeaning;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-3 font-heading text-base font-semibold text-slate-900">
        <HmsIconBadge icon={icon} meaning={meaning} />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value || "Not given"}</dd>
    </div>
  );
}

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
          <SheetTitle className="font-heading">Guest request</SheetTitle>
        </SheetHeader>
        <div className="thin-scrollbar flex-1 overflow-y-auto bg-slate-50 p-4">
          {loading || !req ? (
            <p role="status" className="text-sm text-slate-600">
              {loading ? "Loading the request…" : "We couldn't find this request."}
            </p>
          ) : (
            <div className="space-y-4">
              <SheetSection icon={UserRound} meaning="guests" title="Guest">
                <dl className="grid grid-cols-2 gap-3">
                  <Row label="Name" value={guestName} />
                  <Row label="Room" value={detail?.roomCode} />
                  <Row label="Phone" value={guestPhone} />
                  <Row label="Booking" value={res?.confirmation_code ? String(res.confirmation_code) : null} />
                  <Row label="VIP" value={Boolean(res?.vip_flag) ? "Yes" : "No"} />
                  {res?.arrival_at && res?.departure_at ? (
                    <Row
                      label="Stay"
                      value={`${new Date(String(res.arrival_at)).toLocaleDateString("en-GB")} to ${new Date(String(res.departure_at)).toLocaleDateString("en-GB")}`}
                    />
                  ) : null}
                </dl>
              </SheetSection>

              <SheetSection icon={ConciergeBell} meaning="guests" title={String(req.request_type)}>
                <p className="text-sm text-slate-800">{String(req.details ?? req.notes ?? "No details given.")}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <Row label="Kind" value={String(req.service_category ?? "").replace(/_/g, " ")} />
                  <Row label="Request number" value={`${String(req.id).slice(0, 8)}…`} />
                  <Row label="Made" value={new Date(String(req.created_at)).toLocaleString("en-GB")} />
                </dl>
              </SheetSection>

              <SheetSection icon={UserCog} meaning="team" title="Who's dealing with it">
                {capabilities.canUpdate && !capabilities.readOnly ? (
                  <div className="space-y-4">
                    {assignableStaff.length > 0 ? (
                      <HmsField id="gs-detail-assignee" label="Assigned to">
                        <select
                          id="gs-detail-assignee"
                          className={hmsInput}
                          value={String(req.assigned_user_id ?? "")}
                          onChange={(e) => {
                            const v = e.target.value || null;
                            const st = String(req.status);
                            const updates: Record<string, unknown> = { assignedUserId: v };
                            if (v && st === "pending") updates.status = "assigned";
                            void patch(updates);
                          }}
                        >
                          <option value="">Not assigned</option>
                          {assignableStaff.map((s) => (
                            <option key={s.userId} value={s.userId}>
                              {s.name} ({s.role})
                            </option>
                          ))}
                        </select>
                      </HmsField>
                    ) : null}
                    <HmsField id="gs-detail-status" label="Status">
                      <select id="gs-detail-status" className={`${hmsInput} capitalize`} value={String(req.status)} onChange={(e) => patch({ status: e.target.value })}>
                        {["pending", "assigned", "in_progress", "waiting", "completed", "cancelled", "escalated"].map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </HmsField>
                    <HmsField id="gs-detail-team" label="Team">
                      <select id="gs-detail-team" className={hmsInput} value={String(req.department)} onChange={(e) => patch({ department: e.target.value })}>
                        {GUEST_REQUEST_DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {GUEST_REQUEST_DEPARTMENT_LABELS[d]}
                          </option>
                        ))}
                      </select>
                    </HmsField>
                    <HmsField id="gs-detail-priority" label="Priority">
                      <select id="gs-detail-priority" className={`${hmsInput} capitalize`} value={String(req.priority)} onChange={(e) => patch({ priority: e.target.value })}>
                        {GUEST_REQUEST_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </HmsField>
                    {req.assigned_at ? (
                      <p className="text-sm text-slate-600">Assigned {new Date(String(req.assigned_at)).toLocaleString("en-GB")}</p>
                    ) : null}
                    <HmsField id="gs-detail-due" label="Should be done by">
                      <input
                        id="gs-detail-due"
                        type="datetime-local"
                        className={hmsInput}
                        value={req.expected_completed_at ? toDatetimeLocalValue(String(req.expected_completed_at)) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          void patch({
                            expectedCompletedAt: v ? new Date(v).toISOString() : null,
                          });
                        }}
                      />
                    </HmsField>
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-3">
                    <Row label="Team" value={String(req.department).replace(/_/g, " ")} />
                    <Row label="Status" value={String(req.status).replace(/_/g, " ")} />
                    {req.expected_completed_at ? (
                      <Row label="Should be done by" value={new Date(String(req.expected_completed_at)).toLocaleString("en-GB")} />
                    ) : null}
                  </dl>
                )}
              </SheetSection>

              <SheetSection icon={Receipt} meaning="money" title="Billing">
                <dl className="grid grid-cols-2 gap-3">
                  <Row label="Guest pays for this" value={req.billable ? "Yes" : "No"} />
                  <Row label="On the bill" value={req.folio_line_id ? `Yes (${String(req.folio_line_id).slice(0, 8)}…)` : "Not yet"} />
                </dl>
                {capabilities.canPostFolio && !capabilities.readOnly && !req.folio_line_id && Boolean(req.billable) ? (
                  <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    <HmsField id="gs-detail-amount" label="Amount">
                      <input id="gs-detail-amount" type="number" className={hmsInput} value={folioAmount} onChange={(e) => setFolioAmount(e.target.value)} />
                    </HmsField>
                    <HmsField id="gs-detail-desc" label="What it's for">
                      <input id="gs-detail-desc" className={hmsInput} value={folioDesc} onChange={(e) => setFolioDesc(e.target.value)} />
                    </HmsField>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-400 accent-emerald-700"
                        checked={complimentary}
                        onChange={(e) => setComplimentary(e.target.checked)}
                      />
                      Free of charge (adds it to the bill at zero)
                    </label>
                    <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={postFolio}>
                      Add to the bill
                    </button>
                  </div>
                ) : null}
              </SheetSection>

              <SheetSection icon={NotebookPen} meaning="neutral" title="Staff notes">
                {(detail?.notes ?? []).length > 0 ? (
                  <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
                    {(detail?.notes ?? []).map((n) => (
                      <li key={n.id} className="rounded-xl bg-slate-50 p-3">
                        <p className="mb-1 text-xs font-medium text-slate-700">Seen by: {n.visibility.replace(/_/g, " ")}</p>
                        <p className="text-slate-800">{n.body}</p>
                        <p className="mt-1 text-xs text-slate-600">{new Date(n.created_at).toLocaleString("en-GB")}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-600">No notes yet.</p>
                )}
                {capabilities.canUpdate && !capabilities.readOnly ? (
                  <div className="mt-4 space-y-3">
                    <HmsField id="gs-note-visibility" label="Who can see the note">
                      <select
                        id="gs-note-visibility"
                        className={hmsInput}
                        value={noteVisibility}
                        onChange={(e) => setNoteVisibility(e.target.value as "front_desk" | "department" | "manager")}
                      >
                        <option value="front_desk">Front desk</option>
                        <option value="department">The team handling it</option>
                        {capabilities.canViewManagerNotes ? <option value="manager">Managers only</option> : null}
                      </select>
                    </HmsField>
                    <HmsField id="gs-note-body" label="Note">
                      <textarea id="gs-note-body" className={`${hmsInput} min-h-[64px]`} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
                    </HmsField>
                    <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={addNote}>
                      Add note
                    </button>
                  </div>
                ) : null}
              </SheetSection>

              <SheetSection icon={History} meaning="neutral" title="What's happened">
                {(detail?.events ?? []).length > 0 ? (
                  <ul className="max-h-48 space-y-2 overflow-y-auto text-sm text-slate-700">
                    {(detail?.events ?? []).map((ev) => (
                      <li key={ev.id} className="border-l-2 border-slate-300 pl-3">
                        <span className="font-medium text-slate-900">{ev.actorName ?? "Staff"}</span> · <span>{ev.action.replace(/_/g, " ")}</span>
                        <span className="block text-xs text-slate-600">{new Date(ev.created_at).toLocaleString("en-GB")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-600">Nothing recorded yet.</p>
                )}
              </SheetSection>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
