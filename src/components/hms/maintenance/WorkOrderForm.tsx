"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HmsAlert, HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callApi } from "@/components/hms/maintenance/maint-ui";
import { PRIORITY_LABEL, WO_PRIORITIES, type CategoryRow, type Technician, type WoPriority } from "@/lib/hms/maintenance-shared";

export type RoomChoice = { id: string; code: string };
export type AssetChoice = { id: string; label: string; roomUnitId: string | null };

/** The "Report a fault" form. Anyone on staff can use it; assigning and room blocking need Maintenance access. */
export function WorkOrderForm({
  slug,
  rooms,
  assets,
  categories,
  technicians,
  canManage,
  defaults,
  onDone,
  onCancel,
}: {
  slug: string;
  rooms: RoomChoice[];
  assets: AssetChoice[];
  categories: CategoryRow[];
  technicians: Technician[];
  canManage: boolean;
  defaults?: { roomUnitId?: string; title?: string; assetId?: string; blockId?: string };
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [description, setDescription] = useState("");
  const [where, setWhere] = useState<"room" | "area" | "asset">(defaults?.assetId ? "asset" : defaults?.roomUnitId || !defaults ? "room" : "area");
  const [roomUnitId, setRoomUnitId] = useState(defaults?.roomUnitId ?? "");
  const [area, setArea] = useState("");
  const [assetId, setAssetId] = useState(defaults?.assetId ?? "");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<WoPriority>("normal");
  const [technicianId, setTechnicianId] = useState("");
  const [outOfOrder, setOutOfOrder] = useState(false);
  const [backAt, setBackAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeTechs = technicians.filter((t) => t.active);
  const roomChosen = where === "room" ? roomUnitId : where === "asset" ? (assets.find((a) => a.id === assetId)?.roomUnitId ?? "") : "";

  function pickCategory(name: string) {
    setCategory(name);
    const match = categories.find((c) => c.name === name);
    if (match) setPriority(match.defaultPriority);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("Say what is wrong in a few words.");
    if (where === "room" && !roomUnitId) return setError("Pick the room.");
    if (where === "area" && !area.trim()) return setError("Say which area it is in, for example 'Lobby' or 'Pool'.");
    if (where === "asset" && !assetId) return setError("Pick the equipment.");
    setBusy(true);
    const { error: err, data } = await callApi<{ roomError?: string | null; workOrder?: { id: string } }>("/api/hotel/maintenance/work-orders", "POST", {
      slug,
      title: title.trim(),
      description: description.trim() || undefined,
      category: category || undefined,
      priority,
      source: "staff",
      roomUnitId: where === "room" ? roomUnitId : undefined,
      locationText: where === "area" ? area.trim() : undefined,
      assetId: where === "asset" ? assetId : undefined,
      technicianId: canManage && technicianId ? technicianId : undefined,
      takeRoomOutOfOrder: canManage && outOfOrder && Boolean(roomChosen) ? true : undefined,
      expectedBackAt: canManage && outOfOrder && backAt ? new Date(backAt).toISOString() : undefined,
    });
    setBusy(false);
    if (err) return setError(err);
    if (data?.roomError) {
      // The order was saved; only the room block failed. Say so and open the order.
      alert(`The work order was saved, but the room could not be taken out of order: ${data.roomError}`);
    }
    onDone?.();
    if (data?.workOrder?.id) router.push(`/hms/${slug}/maintenance/orders/${data.workOrder.id}`);
    else router.refresh();
  }

  return (
    <HmsCard id="new-work-order" title="Report a fault" description="Describe the problem and where it is. Maintenance will see it straight away.">
      <form onSubmit={submit} className="space-y-4">
        <HmsAlert message={error} />
        <HmsField id="wo-title" label="What is wrong?">
          <input id="wo-title" className={hmsInput} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="For example: Basin tap is leaking" />
        </HmsField>
        <div className="grid gap-4 sm:grid-cols-2">
          <HmsField id="wo-where" label="Where is it?">
            <select id="wo-where" className={hmsInput} value={where} onChange={(e) => setWhere(e.target.value as "room" | "area" | "asset")}>
              <option value="room">A guest room</option>
              <option value="area">A public area</option>
              <option value="asset">A piece of equipment</option>
            </select>
          </HmsField>
          {where === "room" ? (
            <HmsField id="wo-room" label="Room">
              <select id="wo-room" className={hmsInput} value={roomUnitId} onChange={(e) => setRoomUnitId(e.target.value)}>
                <option value="">Choose a room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code}
                  </option>
                ))}
              </select>
            </HmsField>
          ) : where === "area" ? (
            <HmsField id="wo-area" label="Area">
              <input id="wo-area" className={hmsInput} value={area} onChange={(e) => setArea(e.target.value)} maxLength={200} placeholder="Lobby, pool, kitchen, car park…" />
            </HmsField>
          ) : (
            <HmsField id="wo-asset" label="Equipment">
              <select id="wo-asset" className={hmsInput} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">Choose equipment</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </HmsField>
          )}
          <HmsField id="wo-category" label="Type of problem" optional>
            <select id="wo-category" className={hmsInput} value={category} onChange={(e) => pickCategory(e.target.value)}>
              <option value="">Not sure</option>
              {categories
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </HmsField>
          <HmsField id="wo-priority" label="How urgent?">
            <select id="wo-priority" className={hmsInput} value={priority} onChange={(e) => setPriority(e.target.value as WoPriority)}>
              {WO_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </HmsField>
        </div>
        <HmsField id="wo-desc" label="More detail" optional>
          <textarea id="wo-desc" className={hmsInput} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </HmsField>
        {canManage ? (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <HmsField id="wo-tech" label="Give it to" optional>
              <select id="wo-tech" className={hmsInput} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                <option value="">Leave unassigned</option>
                {activeTechs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </HmsField>
            {roomChosen ? (
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input type="checkbox" className="mt-1" checked={outOfOrder} onChange={(e) => setOutOfOrder(e.target.checked)} />
                  <span>
                    Take this room out of order. It is blocked from sale until the job is done.
                  </span>
                </label>
                {outOfOrder ? (
                  <HmsField id="wo-back" label="Expected back" optional hint="Leave empty if you don't know yet.">
                    <input id="wo-back" type="datetime-local" className={hmsInput} value={backAt} onChange={(e) => setBackAt(e.target.value)} />
                  </HmsField>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={hmsButton.primary}>
            {busy ? "Saving…" : "Raise work order"}
          </button>
          {onCancel ? (
            <button type="button" onClick={onCancel} className={hmsButton.secondary}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </HmsCard>
  );
}
