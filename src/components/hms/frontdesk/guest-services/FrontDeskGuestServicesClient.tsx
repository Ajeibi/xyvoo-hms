"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GuestServicesListPayload, GuestRequestRow } from "@/lib/hms/guest-services";
import type { GuestServicesRoleCapabilities } from "@/lib/hms/guest-services-rbac";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";
import { FrontDeskGuestServiceDetailSheet } from "@/components/hms/frontdesk/guest-services/FrontDeskGuestServiceDetailSheet";
import { FrontDeskGuestServicesAnalytics } from "@/components/hms/frontdesk/guest-services/FrontDeskGuestServicesAnalytics";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CATEGORIES = [
  { value: "housekeeping", label: "Housekeeping" },
  { value: "laundry", label: "Laundry" },
  { value: "food_beverage", label: "Food & beverage" },
  { value: "concierge", label: "Concierge" },
  { value: "maintenance", label: "Maintenance" },
  { value: "security", label: "Security" },
  { value: "spa", label: "Spa" },
  { value: "transportation", label: "Transportation" },
  { value: "special", label: "Special" },
  { value: "other", label: "Other" },
] as const;

function SummaryCard({
  label,
  value,
  subtitle,
  active: isActive,
  onClick,
}: {
  label: string;
  value: number;
  subtitle?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition-colors",
        isActive ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {subtitle ? <p className="mt-1 text-[11px] leading-snug text-slate-500">{subtitle}</p> : null}
    </button>
  );
}

export function FrontDeskGuestServicesClient({
  slug,
  tenantId,
  capabilities,
  initialSearch = "",
}: {
  slug: string;
  tenantId: string;
  capabilities: GuestServicesRoleCapabilities;
  /** Deep link from guest profile etc. */
  initialSearch?: string;
}) {
  const [data, setData] = useState<GuestServicesListPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<{
    status?: string;
    priority?: string;
    department?: string;
    vipOnly?: boolean;
    delayed?: boolean;
    billable?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }>({});
  const [search, setSearch] = useState(initialSearch);
  const [debouncedQ, setDebouncedQ] = useState(initialSearch.trim());

  useEffect(() => {
    setSearch(initialSearch);
    setDebouncedQ(initialSearch.trim());
  }, [initialSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    confirmationCode: "",
    serviceCategory: "special",
    requestType: "",
    details: "",
    priority: "normal" as const,
    billable: false,
  });

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (filter.status) params.set("status", filter.status);
      if (filter.priority) params.set("priority", filter.priority);
      if (filter.department) params.set("department", filter.department);
      if (filter.vipOnly) params.set("vipOnly", "true");
      if (debouncedQ) params.set("q", debouncedQ);
      if (filter.dateFrom) params.set("dateFrom", `${filter.dateFrom}T00:00:00.000Z`);
      if (filter.dateTo) params.set("dateTo", `${filter.dateTo}T23:59:59.999Z`);
      const res = await fetch(`/api/hotel/frontdesk/guest-services?${params}`);
      const json = (await res.json()) as GuestServicesListPayload & { error?: string };
      if (!json.error) setData(json);
    } finally {
      setLoading(false);
    }
  }, [
    slug,
    tenantId,
    filter.status,
    filter.priority,
    filter.department,
    filter.vipOnly,
    filter.dateFrom,
    filter.dateTo,
    debouncedQ,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFrontDeskRealtime(tenantId, Boolean(tenantId), refresh);

  const filteredRows = useMemo(() => {
    const rows = data?.requests ?? [];
    return rows.filter((r) => {
      if (filter.delayed) {
        if (
          !r.expectedCompletedAt ||
          ["completed", "cancelled"].includes(r.status) ||
          new Date(r.expectedCompletedAt).getTime() >= Date.now()
        ) {
          return false;
        }
      }
      if (filter.billable) {
        if (!r.billable || r.folioLineId || ["completed", "cancelled"].includes(r.status)) return false;
      }
      return true;
    });
  }, [data?.requests, filter.delayed, filter.billable]);

  async function submitCreate() {
    if (!capabilities.canCreate) return;
    const res = await fetch(`/api/hotel/frontdesk/guest-services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        confirmationCode: createForm.confirmationCode.trim(),
        serviceCategory: createForm.serviceCategory,
        requestType: createForm.requestType.trim(),
        details: createForm.details.trim() || undefined,
        priority: createForm.priority,
        billable: createForm.billable,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not create request", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Guest service request created");
    setCreateOpen(false);
    setCreateForm({
      confirmationCode: "",
      serviceCategory: "special",
      requestType: "",
      details: "",
      priority: "normal",
      billable: false,
    });
    void refresh();
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Front desk</p>
          <h1 className="text-2xl font-bold text-slate-900">Guest services</h1>
          <p className="mt-1 text-sm text-slate-600">
            Log requests, assign departments, track SLA, and post charges to folio.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {capabilities.canCreate ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              New request
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <FrontDeskGuestServicesAnalytics slug={slug} />

      {summary ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryCard
            label="Active"
            value={summary.active}
            active={!filter.status && !filter.delayed && !filter.billable}
            onClick={() => setFilter({})}
          />
          <SummaryCard
            label="Pending"
            value={summary.pending}
            active={filter.status === "pending"}
            onClick={() => setFilter((f) => ({ ...f, status: f.status === "pending" ? undefined : "pending" }))}
          />
          <SummaryCard label="Completed today" value={summary.completedToday} />
          <SummaryCard
            label="Urgent / VIP"
            value={summary.urgent}
            subtitle={`Urgent ${summary.urgentPriority} · VIP line ${summary.vipLine}`}
            active={filter.priority === "urgent" || filter.priority === "vip"}
            onClick={() =>
              setFilter((f) => {
                if (f.priority === "urgent") return { ...f, priority: "vip" };
                if (f.priority === "vip") return { ...f, priority: undefined };
                return { ...f, priority: "urgent" };
              })
            }
          />
          <SummaryCard
            label="Delayed"
            value={summary.delayed}
            active={filter.delayed}
            onClick={() => setFilter((f) => ({ ...f, delayed: !f.delayed, status: undefined }))}
          />
          <SummaryCard
            label="Billable pending"
            value={summary.billablePending}
            active={filter.billable}
            onClick={() => setFilter((f) => ({ ...f, billable: !f.billable }))}
          />
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Search</p>
            <Input
              className="max-w-xs"
              placeholder="Guest, room, ref, request ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Created from</p>
            <Input
              type="date"
              className="h-10 w-[11rem]"
              value={filter.dateFrom ?? ""}
              onChange={(e) =>
                setFilter((f) => ({ ...f, dateFrom: e.target.value || undefined }))
              }
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Created to</p>
            <Input
              type="date"
              className="h-10 w-[11rem]"
              value={filter.dateTo ?? ""}
              onChange={(e) =>
                setFilter((f) => ({ ...f, dateTo: e.target.value || undefined }))
              }
            />
          </div>
          <select
            className="h-10 rounded-lg border border-input bg-white px-3 text-sm"
            value={filter.department ?? ""}
            onChange={(e) =>
              setFilter((f) => ({ ...f, department: e.target.value || undefined }))
            }
          >
            <option value="">All departments</option>
            <option value="front_desk">Front desk</option>
            <option value="housekeeping">Housekeeping</option>
            <option value="laundry">Laundry</option>
            <option value="maintenance">Maintenance</option>
            <option value="concierge">Concierge</option>
            <option value="security">Security</option>
            <option value="food_beverage">F&amp;B</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filter.vipOnly ?? false}
              onChange={(e) => setFilter((f) => ({ ...f, vipOnly: e.target.checked || undefined }))}
            />
            VIP only
          </label>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Guest / room</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Dept</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">SLA</th>
                <th className="px-4 py-3">Billing</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                    No service requests match your filters.
                  </td>
                </tr>
              ) : (
                <>
                  {filteredRows.map((row) => (
                    <GuestServiceTableRow
                      key={row.id}
                      row={row}
                      onOpen={() => {
                        setSelectedId(row.id);
                        setSheetOpen(true);
                      }}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <FrontDeskGuestServiceDetailSheet
        slug={slug}
        requestId={selectedId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        capabilities={capabilities}
        onUpdated={() => void refresh()}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New guest service request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Confirmation code</p>
              <Input
                value={createForm.confirmationCode}
                onChange={(e) => setCreateForm((s) => ({ ...s, confirmationCode: e.target.value }))}
                placeholder="e.g. ABC123"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Category</p>
              <select
                className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                value={createForm.serviceCategory}
                onChange={(e) => setCreateForm((s) => ({ ...s, serviceCategory: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Request type</p>
              <Input
                value={createForm.requestType}
                onChange={(e) => setCreateForm((s) => ({ ...s, requestType: e.target.value }))}
                placeholder="e.g. Extra towels"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Details</p>
              <textarea
                className="min-h-[72px] w-full rounded-lg border border-input px-3 py-2 text-sm"
                value={createForm.details}
                onChange={(e) => setCreateForm((s) => ({ ...s, details: e.target.value }))}
              />
            </div>
            <div className="flex gap-4">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Priority</p>
                <select
                  className="h-10 rounded-lg border border-input px-3 text-sm"
                  value={createForm.priority}
                  onChange={(e) =>
                    setCreateForm((s) => ({ ...s, priority: e.target.value as typeof s.priority }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createForm.billable}
                  onChange={(e) => setCreateForm((s) => ({ ...s, billable: e.target.checked }))}
                />
                Billable
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitCreate}
              disabled={!createForm.confirmationCode.trim() || !createForm.requestType.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GuestServiceTableRow({ row, onOpen }: { row: GuestRequestRow; onOpen: () => void }) {
  const delayed =
    row.expectedCompletedAt &&
    !["completed", "cancelled"].includes(row.status) &&
    new Date(row.expectedCompletedAt).getTime() < Date.now();
  const shortId = row.id.slice(0, 8);
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/80">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{row.guestName ?? "—"}</p>
        <p className="text-xs text-slate-500">
          {row.roomCode ? `Rm ${row.roomCode}` : "—"} · {row.confirmationCode ?? "—"}
          {row.isVipSnapshot ? (
            <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900">
              VIP
            </span>
          ) : null}
        </p>
      </td>
      <td className="px-4 py-3 text-xs text-slate-700">{row.guestPhone ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <code className="text-xs text-slate-800" title={row.id}>
            {shortId}…
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-[10px]"
            onClick={() => void navigator.clipboard.writeText(row.id)}
          >
            Copy
          </Button>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
        {new Date(row.createdAt).toLocaleString()}
      </td>
      <td className="px-4 py-3 text-xs text-slate-700">{row.assignedStaffName ?? "—"}</td>
      <td className="px-4 py-3">
        <p className="font-medium">{row.requestType}</p>
        <p className="text-xs text-slate-500">{row.serviceCategory.replace(/_/g, " ")}</p>
      </td>
      <td className="px-4 py-3 capitalize text-slate-700">{row.department.replace(/_/g, " ")}</td>
      <td className="px-4 py-3">{row.priority}</td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            row.status === "completed" && "bg-emerald-100 text-emerald-900",
            row.status === "cancelled" && "bg-slate-200 text-slate-700",
            row.status === "escalated" && "bg-red-100 text-red-800",
            !["completed", "cancelled", "escalated"].includes(row.status) && "bg-blue-50 text-blue-800",
          )}
        >
          {row.status.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">
        {row.expectedCompletedAt ? (
          <span className={delayed ? "font-semibold text-red-600" : ""}>
            {new Date(row.expectedCompletedAt).toLocaleString()}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 text-xs">
        {row.billable ? (row.folioLineId ? "Posted" : "Pending") : "N/A"}
      </td>
      <td className="px-4 py-3">
        <Button type="button" size="sm" variant="outline" onClick={onOpen}>
          View
        </Button>
      </td>
    </tr>
  );
}
