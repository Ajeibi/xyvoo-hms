"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Wrench } from "lucide-react";
import { HmsCard, HmsEmptyState, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { DueText, PriorityPill, StatusPill, callApi } from "@/components/hms/maintenance/maint-ui";
import { WorkOrderForm, type AssetChoice, type RoomChoice } from "@/components/hms/maintenance/WorkOrderForm";
import { SOURCE_LABEL, type CategoryRow, type Technician, type WorkOrder, whereOf } from "@/lib/hms/maintenance-shared";

export function WorkOrdersClient({
  slug,
  orders,
  rooms,
  assets,
  categories,
  technicians,
  canManage,
  filter,
  openNew,
  defaults,
}: {
  slug: string;
  orders: WorkOrder[];
  rooms: RoomChoice[];
  assets: AssetChoice[];
  categories: CategoryRow[];
  technicians: Technician[];
  canManage: boolean;
  filter: { status: string; priority: string; technicianId: string; q: string };
  openNew?: boolean;
  defaults?: { roomUnitId?: string; title?: string; assetId?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [showForm, setShowForm] = useState(Boolean(openNew));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState(filter.q);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("new");
    router.push(`/hms/${slug}/maintenance/orders?${next.toString()}`);
  }

  async function quick(wo: WorkOrder, status: "in_progress" | "completed") {
    setError("");
    if (status === "completed") {
      router.push(`/hms/${slug}/maintenance/orders/${wo.id}?finish=1`);
      return;
    }
    setBusyId(wo.id);
    const { error: err } = await callApi(`/api/hotel/maintenance/work-orders/${wo.id}`, "PATCH", { slug, action: "status", status });
    setBusyId(null);
    if (err) return setError(err);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs font-medium text-slate-600">
            Show
          </label>
          <select id="f-status" className={hmsInput} value={filter.status} onChange={(e) => setParam("status", e.target.value)}>
            <option value="open">Open jobs</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">Everything</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-priority" className="mb-1 block text-xs font-medium text-slate-600">
            Priority
          </label>
          <select id="f-priority" className={hmsInput} value={filter.priority} onChange={(e) => setParam("priority", e.target.value)}>
            <option value="">All</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-tech" className="mb-1 block text-xs font-medium text-slate-600">
            Technician
          </label>
          <select id="f-tech" className={hmsInput} value={filter.technicianId} onChange={(e) => setParam("technicianId", e.target.value)}>
            <option value="">Everyone</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setParam("q", q.trim());
          }}
        >
          <div>
            <label htmlFor="f-q" className="mb-1 block text-xs font-medium text-slate-600">
              Search
            </label>
            <input id="f-q" className={hmsInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number or words" />
          </div>
          <button type="submit" className={hmsButton.secondary}>
            Search
          </button>
        </form>
        <div className="ml-auto">
          <button type="button" className={hmsButton.primary} onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden /> Report a fault
          </button>
        </div>
      </div>

      {showForm ? (
        <WorkOrderForm
          slug={slug}
          rooms={rooms}
          assets={assets}
          categories={categories}
          technicians={technicians}
          canManage={canManage}
          defaults={defaults}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {orders.length === 0 ? (
        <HmsEmptyState
          icon={Wrench}
          meaning="care"
          title={filter.status === "open" ? "No open jobs" : "Nothing here"}
          description="Faults reported by staff, housekeeping and the front desk appear here."
        />
      ) : (
        <HmsCard flush title={`${orders.length} ${orders.length === 1 ? "job" : "jobs"}`}>
          <ul className="divide-y divide-slate-100">
            {orders.map((wo) => (
              <li key={wo.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-6">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/hms/${slug}/maintenance/orders/${wo.id}`} className="font-semibold text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      {wo.title}
                    </Link>
                    <PriorityPill priority={wo.priority} />
                    <StatusPill status={wo.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {wo.woNumber} · {whereOf(wo)}
                    {wo.category ? ` · ${wo.category}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {wo.technicianName ? `With ${wo.technicianName}` : "Nobody assigned"} · {SOURCE_LABEL[wo.source]} · <DueText wo={wo} />
                  </p>
                </div>
                {canManage && (wo.status === "open" || wo.status === "assigned" || wo.status === "in_progress") ? (
                  <div className="flex gap-2">
                    {wo.status !== "in_progress" && wo.technicianId ? (
                      <button type="button" disabled={busyId === wo.id} onClick={() => quick(wo, "in_progress")} className={hmsButton.small}>
                        Start
                      </button>
                    ) : null}
                    <button type="button" onClick={() => quick(wo, "completed")} className={hmsButton.small}>
                      Done
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </HmsCard>
      )}
    </div>
  );
}
