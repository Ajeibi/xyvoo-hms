import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestServicesRoleCapabilities } from "@/lib/hms/guest-services-rbac";

export const GUEST_SERVICE_CATEGORIES = [
  "housekeeping",
  "laundry",
  "food_beverage",
  "concierge",
  "maintenance",
  "security",
  "spa",
  "transportation",
  "special",
  "other",
] as const;

export type GuestServiceCategory = (typeof GUEST_SERVICE_CATEGORIES)[number];

export const GUEST_REQUEST_STATUSES = [
  "pending",
  "assigned",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
  "escalated",
] as const;

export type GuestRequestStatus = (typeof GUEST_REQUEST_STATUSES)[number];

export const GUEST_REQUEST_PRIORITIES = ["low", "normal", "high", "urgent", "vip"] as const;
export type GuestRequestPriority = (typeof GUEST_REQUEST_PRIORITIES)[number];

export type GuestRequestRow = {
  id: string;
  reservationId: string;
  roomUnitId: string | null;
  requestType: string;
  serviceCategory: string;
  details: string | null;
  department: string;
  status: string;
  priority: string;
  notes: string | null;
  assignedUserId: string | null;
  /** Display name from profiles when assigned. */
  assignedStaffName: string | null;
  assignedAt: string | null;
  expectedCompletedAt: string | null;
  completedAt: string | null;
  billable: boolean;
  serviceAmount: number | null;
  folioLineId: string | null;
  isVipSnapshot: boolean;
  createdAt: string;
  updatedAt: string;
  confirmationCode: string | null;
  guestName: string | null;
  guestPhone: string | null;
  roomCode: string | null;
  reservationStatus: string | null;
};

export type GuestServicesSummary = {
  active: number;
  pending: number;
  completedToday: number;
  /** Non-terminal rows with priority urgent (excludes VIP-only snapshot without urgent priority). */
  urgentPriority: number;
  /** Non-terminal rows with VIP priority or VIP snapshot on reservation. */
  vipLine: number;
  /** Combined urgent-or-VIP signal (same as former single urgent count). */
  urgent: number;
  delayed: number;
  billablePending: number;
};

export type GuestServicesListPayload = {
  requests: GuestRequestRow[];
  summary: GuestServicesSummary;
};

export function defaultDepartmentForCategory(category: string): string {
  const c = category as GuestServiceCategory;
  const map: Record<string, string> = {
    housekeeping: "housekeeping",
    laundry: "laundry",
    food_beverage: "food_beverage",
    concierge: "concierge",
    maintenance: "maintenance",
    security: "security",
    spa: "front_desk",
    transportation: "concierge",
    special: "front_desk",
    other: "front_desk",
  };
  return map[c] ?? "front_desk";
}

export function slaMinutesForCategory(category: string): number {
  /** Default SLA minutes by category. Automated SLA-breach pushes are deferred (use cron/Edge Function + emitNotification). */
  const map: Record<string, number> = {
    housekeeping: 30,
    laundry: 120,
    food_beverage: 45,
    concierge: 60,
    maintenance: 30,
    security: 15,
    spa: 90,
    transportation: 45,
    special: 60,
    other: 60,
  };
  return map[category] ?? 60;
}

export function computeExpectedCompletedIso(createdAtIso: string, category: string): string {
  const d = new Date(createdAtIso);
  d.setMinutes(d.getMinutes() + slaMinutesForCategory(category));
  return d.toISOString();
}

export function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

export function isDelayedRow(expectedCompletedAt: string | null, status: string): boolean {
  if (!expectedCompletedAt || isTerminalStatus(status)) return false;
  return new Date(expectedCompletedAt).getTime() < Date.now();
}

const TRANSITIONS: Record<string, string[]> = {
  pending: ["assigned", "in_progress", "cancelled", "escalated"],
  assigned: ["in_progress", "waiting", "cancelled", "escalated"],
  in_progress: ["waiting", "completed", "cancelled", "escalated"],
  waiting: ["in_progress", "completed", "cancelled", "escalated"],
  completed: [],
  cancelled: [],
  escalated: ["in_progress", "assigned", "completed", "cancelled"],
};

export function canTransitionStatus(from: string, to: string): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

type GuestEmbed = { first_name?: string; last_name?: string; phone?: string | null } | null;

function primaryGuestFromEmbeds(
  embeds: { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[] | null,
): GuestEmbed | undefined {
  const primary = embeds?.find((e) => e.is_primary) ?? embeds?.[0];
  const g = primary?.guests;
  if (g == null) return undefined;
  if (Array.isArray(g)) return g[0] ?? undefined;
  return g;
}

function guestNameFromReservationEmbeds(
  embeds: { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[] | null,
): string | null {
  const guest = primaryGuestFromEmbeds(embeds);
  if (!guest?.first_name && !guest?.last_name) return null;
  return `${guest.first_name ?? ""} ${guest.last_name ?? ""}`.trim() || null;
}

function guestPhoneFromReservationEmbeds(
  embeds: { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[] | null,
): string | null {
  const guest = primaryGuestFromEmbeds(embeds);
  const p = guest?.phone;
  if (p == null || String(p).trim() === "") return null;
  return String(p).trim();
}

export async function appendGuestRequestEvent(
  service: SupabaseClient,
  params: {
    tenantId: string;
    guestRequestId: string;
    action: string;
    payload?: Record<string, unknown>;
    actorUserId: string | null;
  },
) {
  await service.schema("hotel").from("guest_request_events").insert({
    tenant_id: params.tenantId,
    guest_request_id: params.guestRequestId,
    action: params.action,
    payload: params.payload ?? {},
    actor_user_id: params.actorUserId,
  });
}

export type GuestServicesListFilters = {
  q?: string;
  status?: string;
  priority?: string;
  department?: string;
  vipOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export async function listGuestRequestsForTenant(
  service: SupabaseClient,
  tenantId: string,
  filters: GuestServicesListFilters,
  caps: GuestServicesRoleCapabilities,
): Promise<GuestServicesListPayload> {
  const limit = Math.min(filters.limit ?? 150, 300);

  let q = service
    .schema("hotel")
    .from("guest_requests")
    .select(
      "id,reservation_id,room_unit_id,request_type,service_category,details,department,status,priority,notes,assigned_user_id,assigned_at,expected_completed_at,completed_at,billable,service_amount,folio_line_id,is_vip_snapshot,created_at,updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (caps.departmentScope) {
    q = q.eq("department", caps.departmentScope);
  }

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.priority) q = q.eq("priority", filters.priority);
  if (filters.department) q = q.eq("department", filters.department);
  if (filters.vipOnly) q = q.eq("is_vip_snapshot", true);
  if (filters.dateFrom) q = q.gte("created_at", filters.dateFrom);
  if (filters.dateTo) q = q.lte("created_at", filters.dateTo);

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const reservationIds = [...new Set((rows ?? []).map((r) => r.reservation_id as string))];
  const roomUnitIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.room_unit_id as string | null)
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  const resById = new Map<
    string,
    {
      confirmation_code: string;
      status: string;
      room_unit_id: string | null;
      vip_flag: boolean | null;
      reservation_guests: {
        is_primary: boolean;
        guests: GuestEmbed | GuestEmbed[] | null;
      }[] | null;
    }
  >();

  if (reservationIds.length > 0) {
    const { data: resRows } = await service
      .schema("hotel")
      .from("reservations")
      .select(
        "id,confirmation_code,status,room_unit_id,vip_flag,reservation_guests(is_primary,guests(first_name,last_name,phone))",
      )
      .eq("tenant_id", tenantId)
      .in("id", reservationIds);

    for (const r of resRows ?? []) {
      resById.set(r.id as string, r as never);
    }
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

  const assigneeIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.assigned_user_id as string | null)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const staffNameByUserId = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("user_id,contact_name")
      .in("user_id", assigneeIds);
    for (const p of profiles ?? []) {
      staffNameByUserId.set(
        p.user_id as string,
        (p.contact_name as string)?.trim() || "Staff",
      );
    }
  }

  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  let mapped: GuestRequestRow[] = (rows ?? []).map((r) => {
    const res = resById.get(r.reservation_id as string);
    const ru = (r.room_unit_id as string | null) ?? res?.room_unit_id ?? null;
    return {
      id: r.id as string,
      reservationId: r.reservation_id as string,
      roomUnitId: ru,
      requestType: r.request_type as string,
      serviceCategory: (r.service_category as string) ?? "special",
      details: (r.details as string | null) ?? null,
      department: r.department as string,
      status: r.status as string,
      priority: (r.priority as string) ?? "normal",
      notes: (r.notes as string | null) ?? null,
      assignedUserId: (r.assigned_user_id as string | null) ?? null,
      assignedStaffName: (() => {
        const uid = r.assigned_user_id as string | null;
        return uid ? staffNameByUserId.get(uid) ?? null : null;
      })(),
      assignedAt: (r.assigned_at as string | null) ?? null,
      expectedCompletedAt: (r.expected_completed_at as string | null) ?? null,
      completedAt: (r.completed_at as string | null) ?? null,
      billable: Boolean(r.billable),
      serviceAmount: r.service_amount != null ? Number(r.service_amount) : null,
      folioLineId: (r.folio_line_id as string | null) ?? null,
      isVipSnapshot: Boolean(r.is_vip_snapshot),
      createdAt: r.created_at as string,
      updatedAt: (r.updated_at as string) ?? (r.created_at as string),
      confirmationCode: res?.confirmation_code ?? null,
      guestName: guestNameFromReservationEmbeds(res?.reservation_guests ?? null),
      guestPhone: guestPhoneFromReservationEmbeds(res?.reservation_guests ?? null),
      roomCode: ru ? roomCodeById.get(ru) ?? null : null,
      reservationStatus: res?.status ?? null,
    };
  });

  const qq = (filters.q ?? "").trim().toLowerCase();
  if (qq) {
    mapped = mapped.filter(
      (row) =>
        row.requestType.toLowerCase().includes(qq) ||
        (row.confirmationCode?.toLowerCase().includes(qq) ?? false) ||
        (row.guestName?.toLowerCase().includes(qq) ?? false) ||
        (row.roomCode?.toLowerCase().includes(qq) ?? false) ||
        (row.guestPhone?.toLowerCase().includes(qq) ?? false) ||
        (row.assignedStaffName?.toLowerCase().includes(qq) ?? false) ||
        row.id.toLowerCase().includes(qq),
    );
  }

  const summary = computeSummary(mapped, now, startOfDay.getTime());

  return { requests: mapped, summary };
}

function computeSummary(rows: GuestRequestRow[], _now: number, startOfDayMs: number): GuestServicesSummary {
  let active = 0;
  let pending = 0;
  let completedToday = 0;
  let urgentPriority = 0;
  let vipLine = 0;
  let urgent = 0;
  let delayed = 0;
  let billablePending = 0;

  for (const r of rows) {
    const term = isTerminalStatus(r.status);
    if (!term) active += 1;
    if (r.status === "pending") pending += 1;
    if (r.status === "completed" && r.completedAt && new Date(r.completedAt).getTime() >= startOfDayMs) {
      completedToday += 1;
    }
    if (!term && r.priority === "urgent") urgentPriority += 1;
    if (!term && (r.priority === "vip" || r.isVipSnapshot)) vipLine += 1;
    if (!term && (r.priority === "urgent" || r.priority === "vip" || r.isVipSnapshot)) urgent += 1;
    if (isDelayedRow(r.expectedCompletedAt, r.status)) delayed += 1;
    if (r.billable && !r.folioLineId && !term) billablePending += 1;
  }

  return { active, pending, completedToday, urgentPriority, vipLine, urgent, delayed, billablePending };
}

export async function getGuestRequestDetail(
  service: SupabaseClient,
  tenantId: string,
  requestId: string,
  caps: GuestServicesRoleCapabilities,
) {
  const { data: r, error } = await service
    .schema("hotel")
    .from("guest_requests")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!r) return null;

  if (caps.departmentScope && (r.department as string) !== caps.departmentScope) {
    return null;
  }

  const { data: res } = await service
    .schema("hotel")
    .from("reservations")
    .select(
      "id,confirmation_code,status,arrival_at,departure_at,room_unit_id,vip_flag,checked_in_at,reservation_guests(is_primary,guests(first_name,last_name,phone))",
    )
    .eq("tenant_id", tenantId)
    .eq("id", r.reservation_id as string)
    .maybeSingle();

  let roomCode: string | null = null;
  const ru = (r.room_unit_id as string | null) ?? (res?.room_unit_id as string | null);
  if (ru) {
    const { data: u } = await service
      .schema("hotel")
      .from("room_units")
      .select("room_code")
      .eq("tenant_id", tenantId)
      .eq("id", ru)
      .maybeSingle();
    roomCode = (u?.room_code as string) ?? null;
  }

  const { data: noteRows } = await service
    .schema("hotel")
    .from("guest_request_notes")
    .select("id,body,visibility,author_user_id,created_at")
    .eq("tenant_id", tenantId)
    .eq("guest_request_id", requestId)
    .order("created_at", { ascending: true });

  const { data: eventRows } = await service
    .schema("hotel")
    .from("guest_request_events")
    .select("id,action,payload,actor_user_id,created_at")
    .eq("tenant_id", tenantId)
    .eq("guest_request_id", requestId)
    .order("created_at", { ascending: true });

  const requestDept = r.department as string;

  const notes = (noteRows ?? []).filter((n) => {
    if (n.visibility === "manager" && !caps.canViewManagerNotes) return false;
    // Department-scoped notes: only same department as the request, or non–department-scoped readers.
    if (n.visibility === "department") {
      if (caps.departmentScope && caps.departmentScope !== requestDept) return false;
    }
    return true;
  });

  const actorIds = [
    ...new Set(
      (eventRows ?? [])
        .map((e) => e.actor_user_id as string | null)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const actorNameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("user_id,contact_name")
      .in("user_id", actorIds);
    for (const p of profiles ?? []) {
      actorNameById.set(
        p.user_id as string,
        (p.contact_name as string)?.trim() || "Staff",
      );
    }
  }

  const events = (eventRows ?? []).map((e) => ({
    id: e.id as string,
    action: e.action as string,
    payload: (e.payload as Record<string, unknown>) ?? {},
    actor_user_id: (e.actor_user_id as string | null) ?? null,
    created_at: e.created_at as string,
    actorName:
      e.actor_user_id != null
        ? actorNameById.get(e.actor_user_id as string) ?? "Staff"
        : "System",
  }));

  return {
    request: r,
    reservation: res,
    roomCode,
    notes,
    events,
  };
}

export async function resolveReservationIdByCode(
  service: SupabaseClient,
  tenantId: string,
  code: string,
): Promise<string | null> {
  const c = code.trim();
  if (!c) return null;
  const { data: byCode } = await service
    .schema("hotel")
    .from("reservations")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("confirmation_code", c)
    .maybeSingle();
  if (byCode?.id) return byCode.id as string;

  const { data: byFolio } = await service
    .schema("hotel")
    .from("reservations")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("folio_number", c)
    .maybeSingle();
  return (byFolio?.id as string) ?? null;
}
