"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HmsAlert, HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { DueText, PriorityPill, StatusPill, callApi } from "@/components/hms/maintenance/maint-ui";
import {
  PRIORITY_LABEL,
  SOURCE_LABEL,
  WO_PRIORITIES,
  isOpenStatus,
  type Technician,
  type WoPriority,
  type WorkOrder,
  type WorkOrderEvent,
  type WorkOrderPart, formatDateTime, formatMinutes, money, whereOf } from "@/lib/hms/maintenance-shared";

export type StockChoice = { id: string; label: string };
export type AdoptableBlock = { id: string; reason: string; since: string };

export function WorkOrderDetailClient({
  slug,
  wo,
  events,
  parts,
  technicians,
  items,
  stores,
  adoptable,
  roomStatus,
  currency,
  canManage,
  startFinishing,
}: {
  slug: string;
  wo: WorkOrder;
  events: WorkOrderEvent[];
  parts: WorkOrderPart[];
  technicians: Technician[];
  items: StockChoice[];
  stores: StockChoice[];
  adoptable: AdoptableBlock[];
  roomStatus: string | null;
  currency: string;
  canManage: boolean;
  startFinishing: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"" | "hold" | "finish" | "cancel">(startFinishing ? "finish" : "");
  const [holdReason, setHoldReason] = useState("");
  const [notes, setNotes] = useState("");
  const [labour, setLabour] = useState(String(wo.labourMinutes || ""));
  const [comment, setComment] = useState("");
  const [backAt, setBackAt] = useState("");
  const [partItem, setPartItem] = useState("");
  const [partStore, setPartStore] = useState(stores[0]?.id ?? "");
  const [partQty, setPartQty] = useState("1");

  const open = isOpenStatus(wo.status);
  const api = `/api/hotel/maintenance/work-orders/${wo.id}`;

  async function patch(body: Record<string, unknown>, success?: string): Promise<boolean> {
    setError("");
    setNotice("");
    setBusy(true);
    const { error: err } = await callApi(api, "PATCH", { slug, ...body });
    setBusy(false);
    if (err) {
      setError(err);
      return false;
    }
    if (success) setNotice(success);
    router.refresh();
    return true;
  }

  async function setStatus(status: string, extra: Record<string, unknown> = {}) {
    const ok = await patch({ action: "status", status, ...extra }, status === "completed" ? "Marked completed." : undefined);
    if (ok) setMode("");
  }

  async function issuePart(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const qty = Number(partQty);
    if (!partItem) return setError("Pick the part.");
    if (!partStore) return setError("Pick the store it came from.");
    if (!Number.isFinite(qty) || qty <= 0) return setError("Enter how many were used.");
    setBusy(true);
    const { error: err } = await callApi(`${api}/parts`, "POST", { slug, itemId: partItem, locationId: partStore, qty });
    setBusy(false);
    if (err) return setError(err);
    setPartItem("");
    setPartQty("1");
    setNotice("Part taken out of stock and the cost booked.");
    router.refresh();
  }

  async function returnPart(partId: string) {
    setError("");
    setBusy(true);
    const { error: err } = await callApi(`${api}/parts`, "DELETE", { slug, partId });
    setBusy(false);
    if (err) return setError(err);
    setNotice("Part put back in the store.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <HmsAlert message={error} />
      {notice ? (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}

      <HmsCard id="wo-summary" title={wo.title} description={`${wo.woNumber} · ${whereOf(wo)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityPill priority={wo.priority} />
          <StatusPill status={wo.status} />
          <DueText wo={wo} />
        </div>
        {wo.description ? <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{wo.description}</p> : null}
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Raised</dt>
            <dd className="text-slate-900">
              {formatDateTime(wo.createdAt)} by {wo.reportedByName ?? "staff"} ({SOURCE_LABEL[wo.source]})
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Type</dt>
            <dd className="text-slate-900">{wo.category ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Cost so far</dt>
            <dd className="text-slate-900">
              {money(wo.partsCost, currency)} parts · {formatMinutes(wo.labourMinutes)} labour
            </dd>
          </div>
          {wo.holdReason ? (
            <div className="sm:col-span-3">
              <dt className="text-slate-500">On hold because</dt>
              <dd className="text-slate-900">{wo.holdReason}</dd>
            </div>
          ) : null}
          {wo.resolutionNotes ? (
            <div className="sm:col-span-3">
              <dt className="text-slate-500">What was done</dt>
              <dd className="text-slate-900">{wo.resolutionNotes}</dd>
            </div>
          ) : null}
        </dl>

        {canManage ? (
          <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <HmsField id="d-tech" label="Technician">
                <select
                  id="d-tech"
                  className={hmsInput}
                  value={wo.technicianId ?? ""}
                  disabled={busy || !open}
                  onChange={(e) => patch({ action: "assign", technicianId: e.target.value || null })}
                >
                  <option value="">Nobody</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </HmsField>
              <HmsField id="d-priority" label="Priority">
                <select
                  id="d-priority"
                  className={hmsInput}
                  value={wo.priority}
                  disabled={busy || !open}
                  onChange={(e) => patch({ action: "priority", priority: e.target.value as WoPriority })}
                >
                  {WO_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </HmsField>
            </div>

            <div className="flex flex-wrap gap-2">
              {wo.status !== "in_progress" && open && wo.status !== "on_hold" ? (
                <button type="button" disabled={busy} className={hmsButton.secondary} onClick={() => setStatus("in_progress")}>
                  Start work
                </button>
              ) : null}
              {wo.status === "on_hold" ? (
                <button type="button" disabled={busy} className={hmsButton.secondary} onClick={() => setStatus("in_progress")}>
                  Resume
                </button>
              ) : null}
              {open && wo.status !== "on_hold" ? (
                <button type="button" disabled={busy} className={hmsButton.secondary} onClick={() => setMode(mode === "hold" ? "" : "hold")}>
                  Put on hold
                </button>
              ) : null}
              {open ? (
                <button type="button" disabled={busy} className={hmsButton.primary} onClick={() => setMode(mode === "finish" ? "" : "finish")}>
                  Mark done
                </button>
              ) : null}
              {open ? (
                <button type="button" disabled={busy} className={hmsButton.danger} onClick={() => setMode(mode === "cancel" ? "" : "cancel")}>
                  Cancel order
                </button>
              ) : (
                <button type="button" disabled={busy} className={hmsButton.secondary} onClick={() => setStatus("open")}>
                  Reopen
                </button>
              )}
            </div>

            {mode === "hold" ? (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <HmsField id="d-hold" label="Why is it on hold?">
                  <input id="d-hold" className={hmsInput} value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="Waiting for a part, guest in room…" maxLength={500} />
                </HmsField>
                <button type="button" disabled={busy} className={hmsButton.primary} onClick={() => setStatus("on_hold", { holdReason })}>
                  Put on hold
                </button>
              </div>
            ) : null}
            {mode === "finish" ? (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <HmsField id="d-notes" label="What was done?">
                  <textarea id="d-notes" className={hmsInput} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
                </HmsField>
                <HmsField id="d-labour" label="Time spent (minutes)" optional>
                  <input id="d-labour" inputMode="numeric" className={hmsInput} value={labour} onChange={(e) => setLabour(e.target.value)} />
                </HmsField>
                {wo.roomBlockId ? <p className="text-sm text-slate-600">The room will be released to housekeeping to clean.</p> : null}
                <button
                  type="button"
                  disabled={busy}
                  className={hmsButton.primary}
                  onClick={() => setStatus("completed", { resolutionNotes: notes, labourMinutes: labour.trim() === "" ? undefined : Number(labour) })}
                >
                  Mark done
                </button>
              </div>
            ) : null}
            {mode === "cancel" ? (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <p className="text-sm text-slate-700">Cancel this order? {wo.roomBlockId ? "The room block will be lifted too." : ""}</p>
                <button type="button" disabled={busy} className={hmsButton.danger} onClick={() => setStatus("cancelled")}>
                  Yes, cancel it
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </HmsCard>

      {wo.roomUnitId ? (
        <HmsCard id="wo-room" title={`Room ${wo.roomCode ?? ""}`} description="Taking the room out of order blocks it from sale until the job is done.">
          <p className="text-sm text-slate-700">
            Room status: <strong>{roomStatus ? roomStatus.replace(/_/g, " ") : "unknown"}</strong>.{" "}
            {wo.roomBlockId ? "This order is holding the room out of order." : "The room is not blocked by this order."}
          </p>
          {canManage && open ? (
            <div className="mt-3 space-y-3">
              {wo.roomBlockId ? (
                <button type="button" disabled={busy} className={hmsButton.secondary} onClick={() => patch({ action: "release_room" }, "Room released to housekeeping.")}>
                  Put the room back in service
                </button>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-2">
                    <HmsField id="d-back" label="Expected back" optional>
                      <input id="d-back" type="datetime-local" className={hmsInput} value={backAt} onChange={(e) => setBackAt(e.target.value)} />
                    </HmsField>
                    <button
                      type="button"
                      disabled={busy}
                      className={hmsButton.primary}
                      onClick={() => patch({ action: "out_of_order", expectedBackAt: backAt ? new Date(backAt).toISOString() : undefined }, "Room taken out of order.")}
                    >
                      Take room out of order
                    </button>
                  </div>
                  {adoptable.length > 0 ? (
                    <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">The front desk has already blocked this room:</p>
                      <ul className="mt-1 space-y-1">
                        {adoptable.map((b) => (
                          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {b.reason} (since {formatDateTime(b.since)})
                            </span>
                            <button type="button" disabled={busy} className={hmsButton.small} onClick={() => patch({ action: "adopt_block", blockId: b.id }, "Linked. Finishing this order will lift that block.")}>
                              Link this block
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </HmsCard>
      ) : null}

      <HmsCard id="wo-parts" title="Parts used" description="Parts come out of stock and the cost goes to Repairs & Maintenance in the books.">
        {parts.length === 0 ? (
          <p className="text-sm text-slate-600">No parts used yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {parts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-slate-900">
                  {p.qty} × {p.description}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-slate-700">{money(p.qty * p.unitCost, currency)}</span>
                  {canManage ? (
                    <button type="button" disabled={busy} className={hmsButton.quiet} onClick={() => returnPart(p.id)}>
                      Put back
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canManage && wo.status !== "cancelled" ? (
          <form onSubmit={issuePart} className="mt-4 grid items-end gap-3 sm:grid-cols-[2fr_2fr_1fr_auto]">
            <HmsField id="p-item" label="Part">
              <select id="p-item" className={hmsInput} value={partItem} onChange={(e) => setPartItem(e.target.value)}>
                <option value="">Choose from stock</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </HmsField>
            <HmsField id="p-store" label="From store">
              <select id="p-store" className={hmsInput} value={partStore} onChange={(e) => setPartStore(e.target.value)}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </HmsField>
            <HmsField id="p-qty" label="How many">
              <input id="p-qty" inputMode="decimal" className={hmsInput} value={partQty} onChange={(e) => setPartQty(e.target.value)} />
            </HmsField>
            <button type="submit" disabled={busy} className={hmsButton.primary}>
              Use part
            </button>
          </form>
        ) : null}
      </HmsCard>

      <HmsCard id="wo-activity" title="Activity">
        <ol className="space-y-3">
          {events.map((ev) => (
            <li key={ev.id} className="text-sm">
              <p className="text-slate-900">{ev.body ?? ev.kind}</p>
              <p className="text-xs text-slate-500">
                {ev.actorName ?? "System"} · {formatDateTime(ev.createdAt)}
              </p>
            </li>
          ))}
        </ol>
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!comment.trim()) return;
            if (await patch({ action: "comment", text: comment })) setComment("");
          }}
        >
          <div className="min-w-0 flex-1 basis-64">
            <HmsField id="d-comment" label="Add a note">
              <input id="d-comment" className={hmsInput} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
            </HmsField>
          </div>
          <button type="submit" disabled={busy || !comment.trim()} className={hmsButton.secondary}>
            Add note
          </button>
        </form>
      </HmsCard>
    </div>
  );
}
