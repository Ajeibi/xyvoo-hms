import type { SupabaseClient } from "@supabase/supabase-js";

export const GUEST_INCIDENT_CASE_TYPES = ["complaint", "incident"] as const;
export type GuestIncidentCaseType = (typeof GUEST_INCIDENT_CASE_TYPES)[number];

export const GUEST_INCIDENT_SEVERITIES = ["low", "normal", "high", "critical"] as const;
export type GuestIncidentSeverity = (typeof GUEST_INCIDENT_SEVERITIES)[number];

export const GUEST_INCIDENT_STATUSES = ["open", "in_progress", "escalated", "resolved", "closed"] as const;
export type GuestIncidentStatus = (typeof GUEST_INCIDENT_STATUSES)[number];

export const COMPLAINT_CATEGORIES = [
  "cleanliness",
  "noise",
  "staff_conduct",
  "billing_dispute",
  "amenity_issue",
  "food_beverage",
  "other",
] as const;

export const INCIDENT_CATEGORIES = [
  "safety_security",
  "lost_and_found",
  "theft",
  "injury",
  "property_damage",
  "other",
] as const;

/** Every department role this HMS actually supports (kept in sync with the assignable roles in
 * DEPARTMENT_ROLE_SCOPES / ROLE_SECTIONS), for routing an escalation to the right team. Tenants
 * can still add custom departments via Guest Service Categories; those are merged in additively
 * wherever this list is used, never replaced by it. */
export const CANONICAL_DEPARTMENTS = [
  "front_desk",
  "housekeeping",
  "food_beverage",
  "kitchen",
  "maintenance",
  "procurement",
  "inventory",
  "accounts",
  "hr",
] as const;

export type GuestIncidentRow = {
  id: string;
  caseType: GuestIncidentCaseType;
  reservationId: string | null;
  guestId: string | null;
  roomUnitId: string | null;
  category: string;
  severity: GuestIncidentSeverity;
  status: GuestIncidentStatus;
  description: string;
  resolutionNotes: string | null;
  compensationOffered: string | null;
  reportedBy: string | null;
  reportedByName: string | null;
  escalatedToDepartment: string | null;
  escalatedAt: string | null;
  guestNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  confirmationCode: string | null;
  guestName: string | null;
  roomCode: string | null;
};

export type GuestIncidentsSummary = {
  total: number;
  open: number;
  inProgress: number;
  escalated: number;
  resolvedToday: number;
  complaints: number;
  incidents: number;
  critical: number;
};

export type GuestIncidentsListPayload = {
  rows: GuestIncidentRow[];
  summary: GuestIncidentsSummary;
};

const TRANSITIONS: Record<GuestIncidentStatus, GuestIncidentStatus[]> = {
  open: ["in_progress", "escalated", "resolved", "closed"],
  in_progress: ["escalated", "resolved", "closed"],
  escalated: ["in_progress", "resolved", "closed"],
  resolved: ["closed", "in_progress"],
  closed: [],
};

export function canTransitionIncidentStatus(from: GuestIncidentStatus, to: GuestIncidentStatus): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminalIncidentStatus(status: string): boolean {
  return status === "closed";
}

type GuestEmbed = { first_name?: string; last_name?: string } | null;

function guestDisplayName(g: GuestEmbed): string | null {
  if (!g?.first_name && !g?.last_name) return null;
  return `${g?.first_name ?? ""} ${g?.last_name ?? ""}`.trim() || null;
}

function primaryGuestFromEmbeds(
  embeds: { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[] | null,
): GuestEmbed {
  const primary = embeds?.find((e) => e.is_primary) ?? embeds?.[0];
  const g = primary?.guests;
  if (g == null) return null;
  return Array.isArray(g) ? (g[0] ?? null) : g;
}

export type GuestIncidentsListFilters = {
  q?: string;
  caseType?: GuestIncidentCaseType;
  status?: GuestIncidentStatus;
  severity?: GuestIncidentSeverity;
  limit?: number;
};

export async function listGuestIncidents(
  service: SupabaseClient,
  tenantId: string,
  filters: GuestIncidentsListFilters,
): Promise<GuestIncidentsListPayload> {
  const limit = Math.min(filters.limit ?? 200, 400);

  let q = service
    .schema("hotel")
    .from("guest_incidents")
    .select(
      "id,case_type,reservation_id,guest_id,room_unit_id,category,severity,status,description,resolution_notes,compensation_offered,reported_by,escalated_to_department,escalated_at,guest_notified_at,created_at,updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.caseType) q = q.eq("case_type", filters.caseType);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.severity) q = q.eq("severity", filters.severity);

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const reservationIds = [
    ...new Set((rows ?? []).map((r) => r.reservation_id as string | null).filter((x): x is string => Boolean(x))),
  ];
  const directGuestIds = [
    ...new Set((rows ?? []).map((r) => r.guest_id as string | null).filter((x): x is string => Boolean(x))),
  ];
  const roomUnitIds = [
    ...new Set((rows ?? []).map((r) => r.room_unit_id as string | null).filter((x): x is string => Boolean(x))),
  ];

  const resById = new Map<
    string,
    { confirmation_code: string; reservation_guests: { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[] | null }
  >();
  if (reservationIds.length > 0) {
    const { data: resRows } = await service
      .schema("hotel")
      .from("reservations")
      .select("id,confirmation_code,reservation_guests(is_primary,guests(first_name,last_name))")
      .eq("tenant_id", tenantId)
      .in("id", reservationIds);
    for (const r of resRows ?? []) resById.set(r.id as string, r as never);
  }

  const directGuestById = new Map<string, GuestEmbed>();
  if (directGuestIds.length > 0) {
    const { data: guestRows } = await service
      .schema("hotel")
      .from("guests")
      .select("id,first_name,last_name")
      .eq("tenant_id", tenantId)
      .in("id", directGuestIds);
    for (const g of guestRows ?? []) directGuestById.set(g.id as string, g as GuestEmbed);
  }

  const roomCodeById = new Map<string, string>();
  if (roomUnitIds.length > 0) {
    const { data: units } = await service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code")
      .eq("tenant_id", tenantId)
      .in("id", roomUnitIds);
    for (const u of units ?? []) roomCodeById.set(u.id as string, u.room_code as string);
  }

  const staffIds = [
    ...new Set(
      (rows ?? []).map((r) => r.reported_by as string | null).filter((x): x is string => Boolean(x)),
    ),
  ];
  const staffNameByUserId = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: profiles } = await service.from("profiles").select("user_id,contact_name").in("user_id", staffIds);
    for (const p of profiles ?? []) {
      staffNameByUserId.set(p.user_id as string, (p.contact_name as string)?.trim() || "Staff");
    }
  }

  let mapped: GuestIncidentRow[] = (rows ?? []).map((r) => {
    const resId = r.reservation_id as string | null;
    const res = resId ? resById.get(resId) : undefined;
    const guestId = r.guest_id as string | null;
    const ru = r.room_unit_id as string | null;
    const reportedBy = r.reported_by as string | null;

    return {
      id: r.id as string,
      caseType: r.case_type as GuestIncidentCaseType,
      reservationId: resId,
      guestId,
      roomUnitId: ru,
      category: r.category as string,
      severity: r.severity as GuestIncidentSeverity,
      status: r.status as GuestIncidentStatus,
      description: r.description as string,
      resolutionNotes: (r.resolution_notes as string | null) ?? null,
      compensationOffered: (r.compensation_offered as string | null) ?? null,
      reportedBy,
      reportedByName: reportedBy ? (staffNameByUserId.get(reportedBy) ?? null) : null,
      escalatedToDepartment: (r.escalated_to_department as string | null) ?? null,
      escalatedAt: (r.escalated_at as string | null) ?? null,
      guestNotifiedAt: (r.guest_notified_at as string | null) ?? null,
      createdAt: r.created_at as string,
      updatedAt: (r.updated_at as string) ?? (r.created_at as string),
      confirmationCode: res?.confirmation_code ?? null,
      guestName: res
        ? guestDisplayName(primaryGuestFromEmbeds(res.reservation_guests))
        : guestId
          ? guestDisplayName(directGuestById.get(guestId) ?? null)
          : null,
      roomCode: ru ? (roomCodeById.get(ru) ?? null) : null,
    };
  });

  const qq = (filters.q ?? "").trim().toLowerCase();
  if (qq) {
    mapped = mapped.filter(
      (row) =>
        row.category.toLowerCase().includes(qq) ||
        row.description.toLowerCase().includes(qq) ||
        (row.confirmationCode?.toLowerCase().includes(qq) ?? false) ||
        (row.guestName?.toLowerCase().includes(qq) ?? false) ||
        (row.roomCode?.toLowerCase().includes(qq) ?? false),
    );
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayMs = startOfDay.getTime();

  const summary: GuestIncidentsSummary = {
    total: mapped.length,
    open: mapped.filter((r) => r.status === "open").length,
    inProgress: mapped.filter((r) => r.status === "in_progress").length,
    escalated: mapped.filter((r) => r.status === "escalated").length,
    resolvedToday: mapped.filter(
      (r) => r.status === "resolved" && new Date(r.updatedAt).getTime() >= startOfDayMs,
    ).length,
    complaints: mapped.filter((r) => r.caseType === "complaint").length,
    incidents: mapped.filter((r) => r.caseType === "incident").length,
    critical: mapped.filter((r) => r.severity === "critical" && !isTerminalIncidentStatus(r.status)).length,
  };

  return { rows: mapped, summary };
}
