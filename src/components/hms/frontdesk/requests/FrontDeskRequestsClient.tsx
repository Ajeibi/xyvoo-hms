"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import type { RequestsIncidentsCapabilities } from "@/lib/hms/requests-incidents-rbac";
import {
  CANONICAL_DEPARTMENTS,
  COMPLAINT_CATEGORIES,
  GUEST_INCIDENT_CASE_TYPES,
  GUEST_INCIDENT_SEVERITIES,
  GUEST_INCIDENT_STATUSES,
  INCIDENT_CATEGORIES,
  canTransitionIncidentStatus,
  type GuestIncidentCaseType,
  type GuestIncidentRow,
  type GuestIncidentSeverity,
  type GuestIncidentStatus,
  type GuestIncidentsListPayload,
} from "@/lib/hms/guest-incidents";
import {
  WAITLIST_STATUSES,
  canTransitionWaitlistStatus,
  type WaitlistEntryRow,
  type WaitlistListPayload,
  type WaitlistStatus,
} from "@/lib/hms/waitlist";
import type { GuestRequestRow } from "@/lib/hms/guest-services";

const PAGE_SIZE = 5;

type Tab = "complaints" | "escalations" | "waitlist";

type EscalationRow = {
  key: string;
  kind: "service_request" | "complaint" | "incident";
  title: string;
  guestName: string | null;
  roomCode: string | null;
  escalatedAt: string | null;
  href: string | null;
  incidentRow: GuestIncidentRow | null;
};

const CASE_TYPE_LABEL: Record<GuestIncidentCaseType, string> = {
  complaint: "Complaint",
  incident: "Incident",
};

const DEPARTMENT_LABELS: Record<string, string> = {
  front_desk: "Front desk",
  housekeeping: "Housekeeping",
  food_beverage: "F&B",
  kitchen: "Kitchen",
  maintenance: "Maintenance",
  procurement: "Procurement",
  inventory: "Inventory / Store",
  accounts: "Accounts",
  hr: "HR",
};

const STATUS_LABEL: Record<GuestIncidentStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
};

const SEVERITY_LABEL: Record<GuestIncidentSeverity, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

function statusBadgeClass(status: GuestIncidentStatus) {
  switch (status) {
    case "resolved":
      return "bg-emerald-100 text-emerald-900";
    case "closed":
      return "bg-slate-200 text-slate-700";
    case "escalated":
      return "bg-red-100 text-red-800";
    case "in_progress":
      return "bg-blue-50 text-blue-800";
    default:
      return "bg-amber-50 text-amber-900";
  }
}

function severityBadgeClass(severity: GuestIncidentSeverity) {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-amber-100 text-amber-900";
    case "low":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function FrontDeskRequestsClient({
  slug,
  capabilities,
  roomTypes,
}: {
  slug: string;
  capabilities: RequestsIncidentsCapabilities;
  roomTypes: HotelRoomTypeSetup[];
}) {
  const [tab, setTab] = useState<Tab>("complaints");

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Front desk</p>
          <h1 className="text-2xl font-bold text-slate-900">Requests & incidents</h1>
          <p className="mt-1 text-sm text-slate-600">
            Complaints, incidents, escalations, and the guest waitlist.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
        <span>Logging a service request (towels, housekeeping, F&amp;B, etc.) or tracking its SLA?</span>
        <Button asChild size="sm" variant="outline" className="border-blue-300 bg-white">
          <Link href={`/hms/${slug}/frontdesk/guest-services`}>Open Guest services →</Link>
        </Button>
      </div>

      <div className="mt-6 inline-flex gap-2">
        {(
          [
            ["complaints", "Complaints & incidents"],
            ["escalations", "Escalations"],
            ["waitlist", "Waitlist"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "complaints" ? (
        <ComplaintsIncidentsPanel slug={slug} capabilities={capabilities} />
      ) : tab === "escalations" ? (
        <EscalationsPanel slug={slug} />
      ) : (
        <WaitlistPanel slug={slug} capabilities={capabilities} roomTypes={roomTypes} />
      )}
    </div>
  );
}

function SummaryCard({ label, value, active, onClick }: { label: string; value: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition-colors",
        active ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </button>
  );
}

const sk = "bg-slate-200";

function SummaryCardsSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
          <Skeleton className={`h-3 w-16 ${sk}`} />
          <Skeleton className={`mt-2 h-7 w-10 ${sk}`} />
        </div>
      ))}
    </>
  );
}

function TableRowsSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex gap-8 border-b border-slate-100 bg-slate-50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-3 w-16 ${sk}`} />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-8 px-4 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-4 w-20 ${sk}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="space-y-2">
            <Skeleton className={`h-4 w-48 ${sk}`} />
            <Skeleton className={`h-3 w-32 ${sk}`} />
          </div>
          <Skeleton className={`h-8 w-20 rounded-lg ${sk}`} />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- Complaints & incidents ---------------------------- */

function ComplaintsIncidentsPanel({
  slug,
  capabilities,
}: {
  slug: string;
  capabilities: RequestsIncidentsCapabilities;
}) {
  const [data, setData] = useState<GuestIncidentsListPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [caseTypeFilter, setCaseTypeFilter] = useState<GuestIncidentCaseType | null>(null);
  const [statusFilter, setStatusFilter] = useState<GuestIncidentStatus | null>(null);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageRow, setManageRow] = useState<GuestIncidentRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (search.trim()) params.set("q", search.trim());
      if (caseTypeFilter) params.set("caseType", caseTypeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/hotel/frontdesk/incidents?${params}`);
      const json = (await res.json()) as GuestIncidentsListPayload & { error?: string };
      if (!json.error) {
        setData(json);
        setPage(1);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, search, caseTypeFilter, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [rows, currentPage],
  );

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {loading ? (
            <SummaryCardsSkeleton count={6} />
          ) : (
            <>
              <SummaryCard label="Total" value={data?.summary.total ?? 0} active={!statusFilter} onClick={() => setStatusFilter(null)} />
              <SummaryCard
                label="Open"
                value={data?.summary.open ?? 0}
                active={statusFilter === "open"}
                onClick={() => setStatusFilter((s) => (s === "open" ? null : "open"))}
              />
              <SummaryCard
                label="In progress"
                value={data?.summary.inProgress ?? 0}
                active={statusFilter === "in_progress"}
                onClick={() => setStatusFilter((s) => (s === "in_progress" ? null : "in_progress"))}
              />
              <SummaryCard
                label="Escalated"
                value={data?.summary.escalated ?? 0}
                active={statusFilter === "escalated"}
                onClick={() => setStatusFilter((s) => (s === "escalated" ? null : "escalated"))}
              />
              <SummaryCard label="Resolved today" value={data?.summary.resolvedToday ?? 0} />
              <SummaryCard label="Critical (open)" value={data?.summary.critical ?? 0} />
            </>
          )}
        </div>
        {capabilities.canCreate ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Log complaint / incident
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Search</p>
          <Input
            className="max-w-xs"
            placeholder="Category, description, guest, room…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Type</p>
          <select
            className="h-10 rounded-lg border border-input bg-white px-3 text-sm"
            value={caseTypeFilter ?? ""}
            onChange={(e) => setCaseTypeFilter((e.target.value || null) as GuestIncidentCaseType | null)}
          >
            <option value="">All types</option>
            {GUEST_INCIDENT_CASE_TYPES.map((c) => (
              <option key={c} value={c}>
                {CASE_TYPE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Status</p>
          <select
            className="h-10 rounded-lg border border-input bg-white px-3 text-sm"
            value={statusFilter ?? ""}
            onChange={(e) => setStatusFilter((e.target.value || null) as GuestIncidentStatus | null)}
          >
            <option value="">All statuses</option>
            {GUEST_INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="mt-4">
          <TableRowsSkeleton cols={7} />
        </div>
      ) : (
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {pageRows.length === 0 ? (
          <p className="p-16 text-center text-sm text-slate-500">
            {rows.length === 0 ? "Nothing logged yet." : "Nothing matches your filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="min-w-[220px] px-4 py-3">Description</th>
                  <th className="px-4 py-3">Guest / room</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="min-w-[140px] px-4 py-3">Logged</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{CASE_TYPE_LABEL[row.caseType]}</span>
                      <p className="text-xs capitalize text-slate-500">{row.category.replace(/_/g, " ")}</p>
                    </td>
                    <td className="max-w-[280px] px-4 py-3 text-slate-700">
                      <p className="line-clamp-2">{row.description}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {row.guestName ?? "—"}
                      <p className="text-xs text-slate-400">{row.roomCode ? `Rm ${row.roomCode}` : "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", severityBadgeClass(row.severity))}>
                        {SEVERITY_LABEL[row.severity]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusBadgeClass(row.status))}>
                        {STATUS_LABEL[row.status]}
                        {row.status === "escalated" && row.escalatedToDepartment
                          ? ` → ${DEPARTMENT_LABELS[row.escalatedToDepartment] ?? row.escalatedToDepartment.replace(/_/g, " ")}`
                          : ""}
                        {row.status === "resolved" && row.guestNotifiedAt ? " · notified" : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setManageRow(row)}
                        disabled={!capabilities.canUpdate}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {!loading && rows.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, rows.length)} of {rows.length}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>
              Previous
            </Button>
            <span className="px-2 text-xs font-medium text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <CreateIncidentDialog slug={slug} open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void refresh()} />
      <IncidentManageDialog
        slug={slug}
        row={manageRow}
        open={Boolean(manageRow)}
        onOpenChange={(open) => !open && setManageRow(null)}
        onSaved={() => {
          setManageRow(null);
          void refresh();
        }}
      />
    </div>
  );
}

function CreateIncidentDialog({
  slug,
  open,
  onOpenChange,
  onCreated,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [caseType, setCaseType] = useState<GuestIncidentCaseType>("complaint");
  const [category, setCategory] = useState<string>(COMPLAINT_CATEGORIES[0]);
  const [severity, setSeverity] = useState<GuestIncidentSeverity>("normal");
  const [description, setDescription] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [saving, setSaving] = useState(false);

  const categoryOptions = caseType === "complaint" ? COMPLAINT_CATEGORIES : INCIDENT_CATEGORIES;

  useEffect(() => {
    if (!open) return;
    setCaseType("complaint");
    setCategory(COMPLAINT_CATEGORIES[0]);
    setSeverity("normal");
    setDescription("");
    setConfirmationCode("");
    setRoomCode("");
  }, [open]);

  async function submit() {
    if (!description.trim()) {
      toastError("Description required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          caseType,
          category,
          severity,
          description: description.trim(),
          confirmationCode: confirmationCode.trim() || undefined,
          roomCode: roomCode.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not log this", data.error ?? "Try again.");
        return;
      }
      toastSuccess(caseType === "complaint" ? "Complaint logged" : "Incident logged");
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log complaint / incident</DialogTitle>
          <DialogDescription>Formal record — visible to managers and escalatable.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {GUEST_INCIDENT_CASE_TYPES.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={caseType === c ? "default" : "outline"}
                onClick={() => {
                  setCaseType(c);
                  setCategory(c === "complaint" ? COMPLAINT_CATEGORIES[0] : INCIDENT_CATEGORIES[0]);
                }}
              >
                {CASE_TYPE_LABEL[c]}
              </Button>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Category</p>
            <select
              className="h-10 w-full rounded-lg border border-input px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Severity</p>
            <select
              className="h-10 w-full rounded-lg border border-input px-3 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as GuestIncidentSeverity)}
            >
              {GUEST_INCIDENT_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Confirmation code (optional)</p>
              <Input value={confirmationCode} onChange={(e) => setConfirmationCode(e.target.value)} placeholder="e.g. XYV-ABC" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Room (optional)</p>
              <Input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="e.g. 204" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Description</p>
            <textarea
              className="min-h-[96px] w-full rounded-lg border border-input px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, in the guest's own account where possible…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving || !description.trim()}>
            {saving ? "Logging…" : "Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentManageDialog({
  slug,
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  slug: string;
  row: GuestIncidentRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<GuestIncidentStatus>("open");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [compensationOffered, setCompensationOffered] = useState("");
  const [escalateToDepartment, setEscalateToDepartment] = useState("");
  const [departmentOptions, setDepartmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [notifyGuest, setNotifyGuest] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setStatus(row.status);
    setResolutionNotes(row.resolutionNotes ?? "");
    setCompensationOffered(row.compensationOffered ?? "");
    setEscalateToDepartment("");
    setNotifyGuest(false);
    fetch(`/api/hotel/frontdesk/guest-services/categories?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        const categories = (d.categories ?? []) as { department: string; isActive: boolean }[];
        const seen = new Set<string>();
        const options: { value: string; label: string }[] = [];
        // Canonical departments first (the full org chart), then any tenant-added custom
        // department from Guest Service Categories that isn't already in that list.
        for (const dept of CANONICAL_DEPARTMENTS) {
          if (seen.has(dept)) continue;
          seen.add(dept);
          options.push({ value: dept, label: DEPARTMENT_LABELS[dept] });
        }
        for (const c of categories) {
          if (!c.isActive || seen.has(c.department)) continue;
          seen.add(c.department);
          options.push({ value: c.department, label: DEPARTMENT_LABELS[c.department] ?? c.department.replace(/_/g, " ") });
        }
        setDepartmentOptions(options);
      })
      .catch(() => setDepartmentOptions(CANONICAL_DEPARTMENTS.map((dept) => ({ value: dept, label: DEPARTMENT_LABELS[dept] }))));
  }, [open, row, slug]);

  if (!row) return null;

  const nextStatuses = GUEST_INCIDENT_STATUSES.filter((s) => canTransitionIncidentStatus(row.status, s));
  const canNotify = row.status === "resolved" && !row.guestNotifiedAt;

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { slug };
      if (status === "escalated" && status !== row!.status) {
        if (!escalateToDepartment) {
          toastError("Pick which department this escalates to");
          setSaving(false);
          return;
        }
        body.escalateToDepartment = escalateToDepartment;
      } else if (status !== row!.status) {
        body.status = status;
      }
      if (resolutionNotes.trim() !== (row!.resolutionNotes ?? "")) body.resolutionNotes = resolutionNotes.trim();
      if (compensationOffered.trim() !== (row!.compensationOffered ?? "")) {
        body.compensationOffered = compensationOffered.trim();
      }
      if (notifyGuest) body.markGuestNotified = true;

      if (Object.keys(body).length <= 1) {
        onOpenChange(false);
        return;
      }

      const res = await fetch(`/api/hotel/frontdesk/incidents/${row!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Saved");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const guestMessage = `Hi${row.guestName ? ` ${row.guestName}` : ""}, following up on your ${row.caseType} regarding ${row.category.replace(/_/g, " ")} — it's now resolved.${row.resolutionNotes ? ` ${row.resolutionNotes}` : ""} Thank you for your patience.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {CASE_TYPE_LABEL[row.caseType]} · {row.category.replace(/_/g, " ")}
          </DialogTitle>
          <DialogDescription>{row.guestName ?? "No guest linked"}{row.roomCode ? ` · Room ${row.roomCode}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-slate-50 p-3 text-slate-700">{row.description}</p>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Status</p>
            <select
              className="h-10 w-full rounded-lg border border-input px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as GuestIncidentStatus)}
            >
              <option value={row.status}>{STATUS_LABEL[row.status]} (current)</option>
              {nextStatuses
                .filter((s) => s !== row.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
            </select>
          </div>

          {status === "escalated" ? (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Escalate to department</p>
              <select
                className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                value={escalateToDepartment}
                onChange={(e) => setEscalateToDepartment(e.target.value)}
              >
                <option value="">Select department…</option>
                {departmentOptions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Resolution notes</p>
            <textarea
              className="min-h-[72px] w-full rounded-lg border border-input px-3 py-2 text-sm"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Compensation offered (optional)</p>
            <Input value={compensationOffered} onChange={(e) => setCompensationOffered(e.target.value)} placeholder="e.g. Complimentary breakfast" />
          </div>

          {row.status === "resolved" || status === "resolved" ? (
            <div className="rounded-lg border border-slate-200 p-3">
              {row.guestNotifiedAt ? (
                <p className="text-xs text-emerald-700">Guest already notified {formatDateTime(row.guestNotifiedAt)}.</p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input type="checkbox" checked={notifyGuest} onChange={(e) => setNotifyGuest(e.target.checked)} />
                    Mark guest notified
                  </label>
                  {canNotify ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-slate-500">Suggested message (no messaging integration yet — send manually):</p>
                      <div className="flex items-start gap-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                        <span className="flex-1">{guestMessage}</span>
                        <button
                          type="button"
                          className="shrink-0 text-blue-600 hover:underline"
                          onClick={() => {
                            void navigator.clipboard.writeText(guestMessage);
                            toastSuccess("Message copied");
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- Escalations ---------------------------- */

function EscalationsPanel({ slug }: { slug: string }) {
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [incidentsRes, requestsRes] = await Promise.all([
        fetch(`/api/hotel/frontdesk/incidents?slug=${encodeURIComponent(slug)}&status=escalated`),
        fetch(`/api/hotel/frontdesk/guest-services?slug=${encodeURIComponent(slug)}&status=escalated`),
      ]);

      const merged: EscalationRow[] = [];

      if (incidentsRes.ok) {
        const data = (await incidentsRes.json()) as GuestIncidentsListPayload;
        for (const r of data.rows) {
          merged.push({
            key: `incident-${r.id}`,
            kind: r.caseType,
            title: `${CASE_TYPE_LABEL[r.caseType]} · ${r.category.replace(/_/g, " ")}`,
            guestName: r.guestName,
            roomCode: r.roomCode,
            escalatedAt: r.escalatedAt,
            href: null,
            incidentRow: r,
          });
        }
      }

      if (requestsRes.ok) {
        const data = (await requestsRes.json()) as { requests: GuestRequestRow[] };
        for (const r of data.requests ?? []) {
          merged.push({
            key: `service-${r.id}`,
            kind: "service_request",
            title: `Service request · ${r.requestType}`,
            guestName: r.guestName,
            roomCode: r.roomCode,
            escalatedAt: r.updatedAt,
            href: `/hms/${slug}/frontdesk/guest-services`,
            incidentRow: null,
          });
        }
      }

      merged.sort((a, b) => (b.escalatedAt ?? "").localeCompare(a.escalatedAt ?? ""));
      setRows(merged);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const [manageRow, setManageRow] = useState<GuestIncidentRow | null>(null);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Everything currently escalated to a manager, across service requests, complaints, and incidents.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="mt-4">
          <ListRowsSkeleton />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {rows.length === 0 ? (
            <p className="p-16 text-center text-sm text-slate-500">Nothing is escalated right now.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{row.title}</p>
                    <p className="text-xs text-slate-500">
                      {row.guestName ?? "—"}
                      {row.roomCode ? ` · Rm ${row.roomCode}` : ""}
                      {row.escalatedAt ? ` · ${formatDateTime(row.escalatedAt)}` : ""}
                    </p>
                  </div>
                  {row.href ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={row.href}>Open</Link>
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" onClick={() => setManageRow(row.incidentRow)}>
                      Manage
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <IncidentManageDialog
        slug={slug}
        row={manageRow}
        open={Boolean(manageRow)}
        onOpenChange={(open) => !open && setManageRow(null)}
        onSaved={() => {
          setManageRow(null);
          void refresh();
        }}
      />
    </div>
  );
}

/* ---------------------------- Waitlist ---------------------------- */

const WAITLIST_STATUS_LABEL: Record<WaitlistStatus, string> = {
  waiting: "Waiting",
  notified: "Notified",
  converted: "Converted",
  expired: "Expired",
  cancelled: "Cancelled",
};

function waitlistBadgeClass(status: WaitlistStatus) {
  switch (status) {
    case "converted":
      return "bg-emerald-100 text-emerald-900";
    case "notified":
      return "bg-blue-50 text-blue-800";
    case "expired":
    case "cancelled":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-amber-50 text-amber-900";
  }
}

function WaitlistPanel({
  slug,
  capabilities,
  roomTypes,
}: {
  slug: string;
  capabilities: RequestsIncidentsCapabilities;
  roomTypes: HotelRoomTypeSetup[];
}) {
  const [data, setData] = useState<WaitlistListPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WaitlistStatus | null>(null);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/hotel/frontdesk/waitlist?${params}`);
      const json = (await res.json()) as WaitlistListPayload & { error?: string };
      if (!json.error) {
        setData(json);
        setPage(1);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, search, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [rows, currentPage],
  );

  async function transition(row: WaitlistEntryRow, next: WaitlistStatus) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/frontdesk/waitlist/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Marked ${WAITLIST_STATUS_LABEL[next].toLowerCase()}`);
      void refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {loading ? (
            <SummaryCardsSkeleton count={4} />
          ) : (
            <>
              <SummaryCard label="Total" value={data?.summary.total ?? 0} active={!statusFilter} onClick={() => setStatusFilter(null)} />
              <SummaryCard
                label="Waiting"
                value={data?.summary.waiting ?? 0}
                active={statusFilter === "waiting"}
                onClick={() => setStatusFilter((s) => (s === "waiting" ? null : "waiting"))}
              />
              <SummaryCard
                label="Notified"
                value={data?.summary.notified ?? 0}
                active={statusFilter === "notified"}
                onClick={() => setStatusFilter((s) => (s === "notified" ? null : "notified"))}
              />
              <SummaryCard label="Converted" value={data?.summary.converted ?? 0} />
            </>
          )}
        </div>
        {capabilities.canManageWaitlist ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Add to waitlist
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Search</p>
          <Input
            className="max-w-xs"
            placeholder="Guest, phone, room type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Status</p>
          <select
            className="h-10 rounded-lg border border-input bg-white px-3 text-sm"
            value={statusFilter ?? ""}
            onChange={(e) => setStatusFilter((e.target.value || null) as WaitlistStatus | null)}
          >
            <option value="">All statuses</option>
            {WAITLIST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {WAITLIST_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="mt-4">
          <TableRowsSkeleton cols={6} />
        </div>
      ) : (
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {pageRows.length === 0 ? (
          <p className="p-16 text-center text-sm text-slate-500">
            {rows.length === 0 ? "No one on the waitlist." : "Nothing matches your filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Room type</th>
                  <th className="px-4 py-3">Desired dates</th>
                  <th className="px-4 py-3 text-center">Party</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="font-medium text-slate-900">{row.guestName}</p>
                      <p className="text-xs text-slate-500">{row.phone ?? row.email ?? "—"}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.desiredRoomTypeName ?? "Any"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {row.desiredArrivalDate} → {row.desiredDepartureDate}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-700">{row.partySize}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", waitlistBadgeClass(row.status))}>
                        {WAITLIST_STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {capabilities.canManageWaitlist ? (
                        <div className="flex gap-2">
                          {canTransitionWaitlistStatus(row.status, "notified") && row.status !== "notified" ? (
                            <Button type="button" size="sm" disabled={busyId === row.id} onClick={() => void transition(row, "notified")}>
                              Notify
                            </Button>
                          ) : null}
                          {canTransitionWaitlistStatus(row.status, "converted") ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyId === row.id}
                              onClick={() => void transition(row, "converted")}
                            >
                              Converted
                            </Button>
                          ) : null}
                          {canTransitionWaitlistStatus(row.status, "cancelled") ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-red-700 hover:bg-red-50"
                              disabled={busyId === row.id}
                              onClick={() => void transition(row, "cancelled")}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {!loading && rows.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, rows.length)} of {rows.length}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>
              Previous
            </Button>
            <span className="px-2 text-xs font-medium text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <CreateWaitlistDialog slug={slug} roomTypes={roomTypes} open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void refresh()} />
    </div>
  );
}

function CreateWaitlistDialog({
  slug,
  roomTypes,
  open,
  onOpenChange,
  onCreated,
}: {
  slug: string;
  roomTypes: HotelRoomTypeSetup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [roomTypeCode, setRoomTypeCode] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGuestName("");
    setPhone("");
    setEmail("");
    setRoomTypeCode("");
    setArrivalDate("");
    setDepartureDate("");
    setPartySize("1");
    setNotes("");
  }, [open]);

  async function submit() {
    if (!guestName.trim() || !arrivalDate || !departureDate) {
      toastError("Guest name and desired dates are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          guestName: guestName.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          desiredRoomTypeCode: roomTypeCode || undefined,
          desiredArrivalDate: arrivalDate,
          desiredDepartureDate: departureDate,
          partySize: Number(partySize) || 1,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add to waitlist", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Added to waitlist");
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to waitlist</DialogTitle>
          <DialogDescription>For guests interested in a stay that isn&apos;t available yet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Guest name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <select
            className="h-10 w-full rounded-lg border border-input px-3 text-sm"
            value={roomTypeCode}
            onChange={(e) => setRoomTypeCode(e.target.value)}
          >
            <option value="">Any room type</option>
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Desired arrival</p>
              <Input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Desired departure</p>
              <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Party size</p>
            <Input type="number" min={1} max={20} value={partySize} onChange={(e) => setPartySize(e.target.value)} className="max-w-[120px]" />
          </div>
          <textarea
            className="min-h-[72px] w-full rounded-lg border border-input px-3 py-2 text-sm"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Adding…" : "Add to waitlist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
