"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  CircleAlert,
  CircleCheck,
  Clock,
  ConciergeBell,
  Hourglass,
  ListOrdered,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Siren,
} from "lucide-react";
import {
  HmsCard,
  HmsEmptyState,
  HmsField,
  HmsPage,
  HmsPageHeader,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
  hmsInput,
} from "@/components/hms/hms-ui";
import { HmsFilterChips, HmsSectionIntro } from "@/components/hms/hms-ui-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  return new Date(iso).toLocaleString("en-GB",{ dateStyle: "medium", timeStyle: "short" });
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
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="guests"
        title="Complaints and incidents"
        description="Log problems guests raise, pass them to the right team, and keep a waitlist for full nights."
      />

      <HmsSectionIntro
        id="requests"
        meaning="guests"
        art="people"
        title="Look after every guest who has a problem"
        points={[
          "Log a complaint or an incident as soon as you hear about it, so nothing is forgotten at shift change.",
          "Escalated cases are passed to another team. You'll find them all under Escalations.",
          "When you're full, add guests to the waitlist and let them know when a room comes free.",
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-slate-800">
        <span className="flex items-center gap-2">
          <ConciergeBell className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          Logging an everyday request, such as towels or room service? Use guest services instead.
        </span>
        <Link href={`/hms/${slug}/frontdesk/guest-services`} className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}>
          Open guest services
        </Link>
      </div>

      <HmsFilterChips
        label="Show"
        meaning="guests"
        options={[
          { value: "complaints", label: "Complaints and incidents" },
          { value: "escalations", label: "Escalations" },
          { value: "waitlist", label: "Waitlist" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "complaints" ? (
        <ComplaintsIncidentsPanel slug={slug} capabilities={capabilities} />
      ) : tab === "escalations" ? (
        <EscalationsPanel slug={slug} />
      ) : (
        <WaitlistPanel slug={slug} capabilities={capabilities} roomTypes={roomTypes} />
      )}
    </HmsPage>
  );
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

function PageNav({
  label,
  currentPage,
  totalPages,
  total,
  onPage,
}: {
  label: string;
  currentPage: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
      <p>
        Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}
          disabled={currentPage <= 1}
          onClick={() => onPage(Math.max(1, currentPage - 1))}
        >
          Previous
        </button>
        <span className="px-2 text-sm font-medium text-slate-700">
          Page {currentPage} of {totalPages}
        </span>
        <button
          type="button"
          className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}
          disabled={currentPage >= totalPages}
          onClick={() => onPage(Math.min(totalPages, currentPage + 1))}
        >
          Next
        </button>
      </div>
    </nav>
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
    <div className="space-y-6">
      <HmsStatStrip label="Complaints and incidents in figures">
        {loading && !data ? (
          <SummaryCardsSkeleton count={4} />
        ) : (
          <>
            <HmsStatTile label="Open" value={data?.summary.open ?? 0} icon={MessageSquareWarning} meaning="guests" hint="Waiting for someone to pick up" />
            <HmsStatTile label="In progress" value={data?.summary.inProgress ?? 0} icon={Clock} meaning="guests" hint="Being dealt with" />
            <HmsStatTile
              label="Critical and open"
              value={data?.summary.critical ?? 0}
              icon={Siren}
              meaning="attention"
              hint="Nothing critical right now"
              status={(data?.summary.critical ?? 0) > 0 ? "critical" : undefined}
              statusText="Needs someone now"
            />
            <HmsStatTile label="Sorted today" value={data?.summary.resolvedToday ?? 0} icon={CircleCheck} meaning="guests" hint="Resolved since midnight" />
          </>
        )}
      </HmsStatStrip>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full max-w-md">
            <label htmlFor="incidents-search" className="mb-1 block text-sm font-medium text-slate-800">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                id="incidents-search"
                type="search"
                className={`${hmsInput} pl-10`}
                placeholder="What happened, guest name or room"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            {capabilities.canCreate ? (
              <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Log a complaint or incident
              </button>
            ) : null}
          </div>
        </div>
        <HmsFilterChips
          label="Status"
          meaning="guests"
          options={[
            { value: "all", label: "All", count: data?.summary.total ?? null },
            { value: "open", label: STATUS_LABEL.open, count: data?.summary.open ?? null },
            { value: "in_progress", label: STATUS_LABEL.in_progress, count: data?.summary.inProgress ?? null },
            { value: "escalated", label: STATUS_LABEL.escalated, count: data?.summary.escalated ?? null },
            { value: "resolved", label: STATUS_LABEL.resolved },
            { value: "closed", label: STATUS_LABEL.closed },
          ]}
          value={statusFilter ?? "all"}
          onChange={(v) => setStatusFilter(v === "all" ? null : (v as GuestIncidentStatus))}
        />
        <HmsFilterChips
          label="Type"
          meaning="guests"
          options={[{ value: "all", label: "Both types" }, ...GUEST_INCIDENT_CASE_TYPES.map((c) => ({ value: c as string, label: CASE_TYPE_LABEL[c] }))]}
          value={caseTypeFilter ?? "all"}
          onChange={(v) => setCaseTypeFilter(v === "all" ? null : (v as GuestIncidentCaseType))}
        />
      </div>

      {loading ? (
        <TableRowsSkeleton cols={7} />
      ) : (
      <HmsCard id="incidents-list" icon={MessageSquareWarning} meaning="guests" title="Complaints and incidents" flush>
        {pageRows.length === 0 ? (
          rows.length === 0 && !search.trim() && !statusFilter && !caseTypeFilter ? (
            <HmsEmptyState
              bare
              art="people"
              meaning="guests"
              title="Nothing logged yet"
              description="When a guest raises a problem, log it here so the team can follow it through."
            />
          ) : (
            <HmsEmptyState bare icon={SearchX} meaning="guests" title="Nothing matches" description="Try a different search, or choose All." />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <caption className="sr-only">Complaints and incidents</caption>
              <thead className="bg-slate-50 text-sm text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                  <th scope="col" className="min-w-[220px] px-4 py-3 font-semibold">What happened</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Guest and room</th>
                  <th scope="col" className="px-4 py-3 font-semibold">How serious</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="min-w-[140px] px-4 py-3 font-semibold">Logged</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-amber-50/40">
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{CASE_TYPE_LABEL[row.caseType]}</span>
                      <p className="text-xs capitalize text-slate-600">{row.category.replace(/_/g, " ")}</p>
                    </td>
                    <td className="max-w-[280px] px-4 py-3 text-slate-800">
                      <p className="line-clamp-2">{row.description}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                      {row.guestName ?? "No guest linked"}
                      <p className="text-xs text-slate-600">{row.roomCode ? `Room ${row.roomCode}` : "No room"}</p>
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
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}
                        onClick={() => setManageRow(row)}
                        disabled={!capabilities.canUpdate}
                      >
                        Manage<span className="sr-only"> {CASE_TYPE_LABEL[row.caseType].toLowerCase()} logged {formatDateTime(row.createdAt)}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>
      )}

      {!loading && rows.length > 0 ? (
        <PageNav label="Pages of complaints and incidents" currentPage={currentPage} totalPages={totalPages} total={rows.length} onPage={setPage} />
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
          <DialogTitle>Log a complaint or incident</DialogTitle>
          <DialogDescription>This is kept on record. Managers can see it and pass it to another team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <HmsFilterChips
            label="This is a"
            meaning="guests"
            options={GUEST_INCIDENT_CASE_TYPES.map((c) => ({ value: c as string, label: CASE_TYPE_LABEL[c] }))}
            value={caseType}
            onChange={(c) => {
              setCaseType(c as GuestIncidentCaseType);
              setCategory(c === "complaint" ? COMPLAINT_CATEGORIES[0] : INCIDENT_CATEGORIES[0]);
            }}
          />
          <HmsField id="incident-category" label="Category">
            <select id="incident-category" className={`${hmsInput} capitalize`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </HmsField>
          <HmsField id="incident-severity" label="How serious is it?">
            <select
              id="incident-severity"
              className={hmsInput}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as GuestIncidentSeverity)}
            >
              {GUEST_INCIDENT_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </HmsField>
          <div className="grid gap-4 sm:grid-cols-2">
            <HmsField id="incident-code" label="Confirmation code" optional>
              <input id="incident-code" className={hmsInput} value={confirmationCode} onChange={(e) => setConfirmationCode(e.target.value)} />
            </HmsField>
            <HmsField id="incident-room" label="Room" optional>
              <input id="incident-room" className={hmsInput} value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
            </HmsField>
          </div>
          <HmsField id="incident-description" label="What happened?" hint="Use the guest's own words where you can.">
            <textarea
              id="incident-description"
              aria-describedby="incident-description-hint"
              className={`${hmsInput} min-h-[96px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </HmsField>
        </div>
        <DialogFooter>
          <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => void submit()} disabled={saving || !description.trim()}>
            {saving ? "Saving…" : "Save to the record"}
          </button>
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
        <div className="space-y-4 text-sm">
          <p className="rounded-xl bg-amber-50 p-3 text-slate-800">{row.description}</p>

          <HmsField id="manage-status" label="Status">
            <select
              id="manage-status"
              className={hmsInput}
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
          </HmsField>

          {status === "escalated" ? (
            <HmsField id="manage-department" label="Pass it to">
              <select
                id="manage-department"
                className={hmsInput}
                value={escalateToDepartment}
                onChange={(e) => setEscalateToDepartment(e.target.value)}
              >
                <option value="">Choose a team…</option>
                {departmentOptions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </HmsField>
          ) : null}

          <HmsField id="manage-resolution" label="How it was sorted" optional>
            <textarea
              id="manage-resolution"
              className={`${hmsInput} min-h-[72px]`}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
          </HmsField>
          <HmsField id="manage-compensation" label="Anything offered to the guest" optional hint="For example: a free breakfast.">
            <input
              id="manage-compensation"
              aria-describedby="manage-compensation-hint"
              className={hmsInput}
              value={compensationOffered}
              onChange={(e) => setCompensationOffered(e.target.value)}
            />
          </HmsField>

          {row.status === "resolved" || status === "resolved" ? (
            <div className="rounded-xl border border-slate-200 p-3">
              {row.guestNotifiedAt ? (
                <p className="text-sm text-emerald-800">The guest was told on {formatDateTime(row.guestNotifiedAt)}.</p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input type="checkbox" className="h-4 w-4 accent-amber-700" checked={notifyGuest} onChange={(e) => setNotifyGuest(e.target.checked)} />
                    I&apos;ve told the guest
                  </label>
                  {canNotify ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-slate-600">A message you could send them (copy it into your usual app):</p>
                      <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-800">
                        <span className="flex-1">{guestMessage}</span>
                        <button
                          type="button"
                          className={`shrink-0 rounded font-medium text-blue-700 hover:underline ${focusRing}`}
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
          <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => onOpenChange(false)}>
            Close
          </button>
          <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">Everything that has been passed on for someone else to deal with: requests, complaints and incidents.</p>
        <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <ListRowsSkeleton />
      ) : (
        <HmsCard
          id="escalations-list"
          icon={ArrowUpRight}
          meaning={rows.length > 0 ? "attention" : "guests"}
          title={rows.length > 0 ? `${rows.length} passed to another team` : "Escalations"}
          flush
        >
          {rows.length === 0 ? (
            <HmsEmptyState
              bare
              art="people"
              meaning="guests"
              title="Nothing is escalated right now"
              description="When a request, complaint or incident is passed to another team, it will appear here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => (
                <li key={row.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{row.title}</p>
                    <p className="text-sm text-slate-600">
                      {row.guestName ?? "No guest linked"}
                      {row.roomCode ? ` · Room ${row.roomCode}` : ""}
                      {row.escalatedAt ? ` · ${formatDateTime(row.escalatedAt)}` : ""}
                    </p>
                  </div>
                  {row.href ? (
                    <Link href={row.href} className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}>
                      Open<span className="sr-only"> {row.title}</span>
                    </Link>
                  ) : (
                    <button type="button" className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`} onClick={() => setManageRow(row.incidentRow)}>
                      Manage<span className="sr-only"> {row.title}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </HmsCard>
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
  const [cancelTarget, setCancelTarget] = useState<WaitlistEntryRow | null>(null);

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
    <div className="space-y-6">
      <HmsStatStrip label="Waitlist in figures">
        {loading && !data ? (
          <SummaryCardsSkeleton count={4} />
        ) : (
          <>
            <HmsStatTile label="On the waitlist" value={data?.summary.total ?? 0} icon={ListOrdered} meaning="guests" hint="Everyone added" />
            <HmsStatTile label="Waiting" value={data?.summary.waiting ?? 0} icon={Hourglass} meaning="guests" hint="Not contacted yet" />
            <HmsStatTile label="Told a room is free" value={data?.summary.notified ?? 0} icon={BellRing} meaning="guests" hint="Contacted" />
            <HmsStatTile label="Booked" value={data?.summary.converted ?? 0} icon={CircleCheck} meaning="rooms" hint="Turned into a booking" />
          </>
        )}
      </HmsStatStrip>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full max-w-md">
            <label htmlFor="waitlist-search" className="mb-1 block text-sm font-medium text-slate-800">
              Search the waitlist
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                id="waitlist-search"
                type="search"
                className={`${hmsInput} pl-10`}
                placeholder="Guest name, phone or room type"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          {capabilities.canManageWaitlist ? (
            <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add to the waitlist
            </button>
          ) : null}
        </div>
        <HmsFilterChips
          label="Status"
          meaning="guests"
          options={[
            { value: "all", label: "All", count: data?.summary.total ?? null },
            ...WAITLIST_STATUSES.map((s) => ({
              value: s as string,
              label: WAITLIST_STATUS_LABEL[s],
              count: s === "waiting" ? (data?.summary.waiting ?? null) : s === "notified" ? (data?.summary.notified ?? null) : s === "converted" ? (data?.summary.converted ?? null) : null,
            })),
          ]}
          value={statusFilter ?? "all"}
          onChange={(v) => setStatusFilter(v === "all" ? null : (v as WaitlistStatus))}
        />
      </div>

      {loading ? (
        <TableRowsSkeleton cols={6} />
      ) : (
      <HmsCard id="waitlist-list" icon={ListOrdered} meaning="guests" title="Waitlist" flush>
        {pageRows.length === 0 ? (
          rows.length === 0 && !search.trim() && !statusFilter ? (
            <HmsEmptyState
              bare
              art="people"
              meaning="guests"
              title="No one on the waitlist"
              description="When you're full, add guests here and let them know when a room comes free."
            />
          ) : (
            <HmsEmptyState bare icon={SearchX} meaning="guests" title="Nothing matches" description="Try a different search, or choose All." />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Waitlist</caption>
              <thead className="bg-slate-50 text-sm text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Guest</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Room type</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Dates wanted</th>
                  <th scope="col" className="px-4 py-3 text-center font-semibold">Guests</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-amber-50/40">
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="font-medium text-slate-900">{row.guestName}</p>
                      <p className="text-xs text-slate-600">{row.phone ?? row.email ?? "No contact details"}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.desiredRoomTypeName ?? "Any"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {row.desiredArrivalDate} to {row.desiredDepartureDate}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-700">{row.partySize}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", waitlistBadgeClass(row.status))}>
                        {WAITLIST_STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {capabilities.canManageWaitlist ? (
                        <div className="flex gap-2">
                          {canTransitionWaitlistStatus(row.status, "notified") && row.status !== "notified" ? (
                            <button
                              type="button"
                              className={`${hmsButton.primary} px-3 py-1.5 ${focusRing}`}
                              disabled={busyId === row.id}
                              onClick={() => void transition(row, "notified")}
                            >
                              Mark as told<span className="sr-only">: {row.guestName}</span>
                            </button>
                          ) : null}
                          {canTransitionWaitlistStatus(row.status, "converted") ? (
                            <button
                              type="button"
                              className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}
                              disabled={busyId === row.id}
                              onClick={() => void transition(row, "converted")}
                            >
                              Mark as booked<span className="sr-only">: {row.guestName}</span>
                            </button>
                          ) : null}
                          {canTransitionWaitlistStatus(row.status, "cancelled") ? (
                            <button
                              type="button"
                              className={`${hmsButton.danger} ${focusRing}`}
                              disabled={busyId === row.id}
                              onClick={() => setCancelTarget(row)}
                            >
                              Remove<span className="sr-only">: {row.guestName}</span>
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-600">
                          <span aria-hidden>—</span>
                          <span className="sr-only">No actions</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>
      )}

      {!loading && rows.length > 0 ? (
        <PageNav label="Pages of the waitlist" currentPage={currentPage} totalPages={totalPages} total={rows.length} onPage={setPage} />
      ) : null}

      <CreateWaitlistDialog slug={slug} roomTypes={roomTypes} open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void refresh()} />

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this waitlist entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget ? `${cancelTarget.guestName} will be removed from the waitlist for ${cancelTarget.desiredArrivalDate} — ${cancelTarget.desiredDepartureDate}.` : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelTarget) void transition(cancelTarget, "cancelled");
                setCancelTarget(null);
              }}
            >
              Cancel entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 flex items-center gap-1 text-sm text-red-700">
      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
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
  // Field messages only appear after the first attempt to save.
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTried(false);
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
        <div className="space-y-4">
          <HmsField id="waitlist-name" label="Guest name">
            <input
              id="waitlist-name"
              className={hmsInput}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              aria-invalid={tried && !guestName.trim()}
              aria-describedby={tried && !guestName.trim() ? "waitlist-name-error" : undefined}
            />
            {tried && !guestName.trim() ? <FieldError id="waitlist-name-error">Enter the guest&apos;s name.</FieldError> : null}
          </HmsField>
          <div className="grid gap-4 sm:grid-cols-2">
            <HmsField id="waitlist-phone" label="Phone" optional>
              <input id="waitlist-phone" type="tel" className={hmsInput} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </HmsField>
            <HmsField id="waitlist-email" label="Email" optional>
              <input id="waitlist-email" type="email" className={hmsInput} value={email} onChange={(e) => setEmail(e.target.value)} />
            </HmsField>
          </div>
          <HmsField id="waitlist-room-type" label="Room type">
            <select id="waitlist-room-type" className={hmsInput} value={roomTypeCode} onChange={(e) => setRoomTypeCode(e.target.value)}>
              <option value="">Any room type</option>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </HmsField>
          <div className="grid gap-4 sm:grid-cols-2">
            <HmsField id="waitlist-arrival" label="Arriving">
              <input
                id="waitlist-arrival"
                type="date"
                className={hmsInput}
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                aria-invalid={tried && !arrivalDate}
                aria-describedby={tried && !arrivalDate ? "waitlist-arrival-error" : undefined}
              />
              {tried && !arrivalDate ? <FieldError id="waitlist-arrival-error">Choose an arrival date.</FieldError> : null}
            </HmsField>
            <HmsField id="waitlist-departure" label="Leaving">
              <input
                id="waitlist-departure"
                type="date"
                className={hmsInput}
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                aria-invalid={tried && !departureDate}
                aria-describedby={tried && !departureDate ? "waitlist-departure-error" : undefined}
              />
              {tried && !departureDate ? <FieldError id="waitlist-departure-error">Choose a departure date.</FieldError> : null}
            </HmsField>
          </div>
          <HmsField id="waitlist-party" label="Number of guests">
            <input
              id="waitlist-party"
              type="number"
              min={1}
              max={20}
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              className={`${hmsInput} max-w-[120px]`}
            />
          </HmsField>
          <HmsField id="waitlist-notes" label="Notes" optional>
            <textarea id="waitlist-notes" className={`${hmsInput} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </HmsField>
        </div>
        <DialogFooter>
          <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={`${hmsButton.primary} ${focusRing}`}
            onClick={() => {
              setTried(true);
              void submit();
            }}
            disabled={saving}
          >
            {saving ? "Adding…" : "Add to the waitlist"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
