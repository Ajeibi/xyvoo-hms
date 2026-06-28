import type { FrontDeskBoardData, FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import { getFrontDeskBoardData, loadFrontDeskRoomBoardItemForUnit } from "@/lib/hms/front-desk-board";
import { formatAuditMessage } from "@/lib/hms/front-desk-ops";
import { mapRoomReadiness } from "@/lib/hms/arrivals-room";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { getActiveBlocksForRooms, type RoomBlockRow } from "@/lib/hms/rooms-ops";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RoomsSummary = {
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  reservedRooms: number;
  dirtyRooms: number;
  maintenanceRooms: number;
  outOfServiceRooms: number;
  priorityCleaning: number;
  overdueCheckout: number;
};

export type RoomsWorkbenchFilters = {
  q?: string;
  floor?: number;
  roomType?: string;
  displayStatus?: string;
  vipOnly?: boolean;
  priorityCleanOnly?: boolean;
  /** Composite: inHouse + overdueCheckout */
  occupied?: boolean;
};

export type RoomsWorkbenchPayload = {
  board: FrontDeskBoardData;
  summary: RoomsSummary;
  currency: string;
};

export type RoomDetailPayload = {
  /** Full board item when loaded server-side; null when client already has board context (`fromBoard=1`). */
  room: FrontDeskRoomBoardItem | null;
  /** Authoritative unit status from `room_units.status`. */
  unitStatus: string;
  roomType: {
    code: string;
    name: string;
    bedType: string | null;
    capacity: number | null;
  };
  blocks: RoomBlockRow[];
  connectingRoomCodes: string[];
  notes: { id: string; body: string; createdAt: string; authorName: string }[];
  incidents: {
    id: string;
    incidentType: string;
    description: string;
    status: string;
    createdAt: string;
  }[];
  housekeepingDetail: {
    status: string | null;
    priorityLevel: string | null;
    dueBy: string | null;
    updatedAt: string | null;
  } | null;
};

function allRooms(board: FrontDeskBoardData): FrontDeskRoomBoardItem[] {
  return Object.values(board.roomsByFloor).flat();
}

export function buildRoomsSummary(board: FrontDeskBoardData, priorityCleaning: number): RoomsSummary {
  const s = board.summaryCounts;
  return {
    totalRooms: board.occupancy.totalRooms,
    availableRooms: s.available,
    occupiedRooms: s.inHouse + s.overdueCheckout,
    reservedRooms: s.reserved,
    dirtyRooms: s.dirty,
    maintenanceRooms: s.maintenance,
    outOfServiceRooms: s.outOfService,
    priorityCleaning,
    overdueCheckout: s.overdueCheckout,
  };
}

export function filterBoardRooms(
  board: FrontDeskBoardData,
  filters?: RoomsWorkbenchFilters,
): FrontDeskBoardData {
  if (!filters) return board;
  let rooms = allRooms(board);

  if (filters.floor != null) {
    rooms = rooms.filter((r) => r.floor === filters.floor);
  }
  if (filters.roomType) {
    rooms = rooms.filter((r) => r.roomTypeCode === filters.roomType);
  }
  if (filters.occupied) {
    rooms = rooms.filter(
      (r) => r.displayStatus === "inHouse" || r.displayStatus === "overdueCheckout",
    );
  } else if (filters.displayStatus) {
    rooms = rooms.filter((r) => r.displayStatus === filters.displayStatus);
  }
  if (filters.priorityCleanOnly) {
    rooms = rooms.filter((r) => {
      const p = r.housekeeping?.priorityLevel;
      return p === "high" || p === "urgent" || p === "vip";
    });
  }
  if (filters.vipOnly) {
    rooms = rooms.filter((r) => r.stay?.isVip || r.reservedStay?.isVip);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    rooms = rooms.filter((r) => {
      if (r.roomCode.toLowerCase().includes(q)) return true;
      if (r.stay?.guestName.toLowerCase().includes(q)) return true;
      if (r.reservedStay?.guestName.toLowerCase().includes(q)) return true;
      if (r.roomTypeCode.toLowerCase().includes(q)) return true;
      return false;
    });
  }

  const roomsByFloor: Record<number, FrontDeskRoomBoardItem[]> = {};
  for (const room of rooms) {
    if (!roomsByFloor[room.floor]) roomsByFloor[room.floor] = [];
    roomsByFloor[room.floor].push(room);
  }
  for (const floor of Object.keys(roomsByFloor)) {
    roomsByFloor[Number(floor)].sort((a, b) => a.roomCode.localeCompare(b.roomCode));
  }

  return {
    ...board,
    floors: [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b),
    roomsByFloor,
  };
}

export async function getRoomsWorkbenchData(params: {
  tenantId: string;
  slug: string;
  currency: string;
  floorPlanRaw: unknown;
  roomTypes: HotelRoomTypeSetup[];
  filters?: RoomsWorkbenchFilters;
}): Promise<RoomsWorkbenchPayload> {
  const supabase = createServerSupabaseClient();
  const board = await getFrontDeskBoardData({
    tenantId: params.tenantId,
    floorPlanRaw: params.floorPlanRaw,
    roomTypes: params.roomTypes,
    currency: params.currency,
  });

  let priorityCleaning = 0;
  const { count, error: priErr } = await supabase
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", params.tenantId)
    .in("priority_level", ["high", "urgent", "vip"]);
  if (!priErr) priorityCleaning = count ?? 0;

  const summary = buildRoomsSummary(board, priorityCleaning);
  const filtered = filterBoardRooms(board, params.filters);

  return {
    board: filtered,
    summary,
    currency: params.currency,
  };
}

function roomTypeMeta(code: string, roomTypes: HotelRoomTypeSetup[]) {
  const t = roomTypes.find((r) => r.id === code);
  return {
    code,
    name: t?.name ?? code,
    bedType: t?.boardBasis ?? null,
    capacity: t?.maxOccupancy ?? null,
  };
}

async function profileNameMap(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  userIds: string[],
) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const { data: profiles } = await supabase
    .schema("hotel")
    .from("profiles")
    .select("user_id,contact_name")
    .eq("tenant_id", tenantId)
    .in("user_id", unique);
  return new Map((profiles ?? []).map((p) => [p.user_id, p.contact_name ?? "Staff"]));
}

export async function getRoomDetail(params: {
  tenantId: string;
  roomUnitId: string;
  currency: string;
  roomTypes: HotelRoomTypeSetup[];
  boardRoom?: FrontDeskRoomBoardItem;
  /** Skip expensive reservation/guest/folio reload when the grid already has board context. */
  fromBoard?: boolean;
}): Promise<RoomDetailPayload | null> {
  const supabase = createServerSupabaseClient();

  const { data: unit } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("id,room_code,floor,room_type_code,status,notes")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.roomUnitId)
    .maybeSingle();

  if (!unit) return null;

  const [blockMap, linksResult, noteResult, hkResult, incidentsResult] = await Promise.all([
    getActiveBlocksForRooms(supabase, params.tenantId, [unit.id]),
    supabase
      .schema("hotel")
      .from("room_connecting_links")
      .select("room_unit_id_a,room_unit_id_b")
      .eq("tenant_id", params.tenantId)
      .or(`room_unit_id_a.eq.${unit.id},room_unit_id_b.eq.${unit.id}`),
    supabase
      .schema("hotel")
      .from("room_unit_notes")
      .select("id,body,created_at,author_user_id")
      .eq("tenant_id", params.tenantId)
      .eq("room_unit_id", unit.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .schema("hotel")
      .from("housekeeping_tasks")
      .select("status,priority_level,due_by,updated_at")
      .eq("tenant_id", params.tenantId)
      .eq("room_unit_id", unit.id)
      .maybeSingle(),
    supabase
      .schema("hotel")
      .from("room_incidents")
      .select("id,incident_type,description,status,created_at")
      .eq("tenant_id", params.tenantId)
      .eq("room_unit_id", unit.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const blocks = blockMap.get(unit.id) ?? [];
  const links = linksResult.data ?? [];
  const noteRows = noteResult.data ?? [];
  const hkRow = hkResult.data;
  const incidents = incidentsResult.data ?? [];

  const otherIds = links.map((l) =>
    l.room_unit_id_a === unit.id ? l.room_unit_id_b : l.room_unit_id_a,
  );
  let connectingRoomCodes: string[] = [];
  if (otherIds.length) {
    const { data: others } = await supabase
      .schema("hotel")
      .from("room_units")
      .select("room_code")
      .in("id", otherIds);
    connectingRoomCodes = (others ?? []).map((o) => o.room_code);
  }

  const authorIds = noteRows.map((n) => n.author_user_id).filter((id): id is string => Boolean(id));
  const nameByUser = await profileNameMap(supabase, params.tenantId, authorIds);

  const notes = noteRows.map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.created_at,
    authorName: n.author_user_id ? nameByUser.get(n.author_user_id) ?? "Staff" : "System",
  }));

  let room: FrontDeskRoomBoardItem | null = params.boardRoom ?? null;
  if (!params.fromBoard && !room) {
    room = await loadFrontDeskRoomBoardItemForUnit({
      tenantId: params.tenantId,
      unit: {
        id: unit.id,
        room_code: unit.room_code,
        floor: unit.floor,
        room_type_code: unit.room_type_code,
        status: unit.status,
        notes: unit.notes,
      },
      roomTypes: params.roomTypes,
    });
  }

  return {
    room: params.fromBoard ? null : room,
    unitStatus: unit.status,
    roomType: roomTypeMeta(unit.room_type_code, params.roomTypes),
    blocks,
    connectingRoomCodes,
    notes,
    incidents: incidents.map((i) => ({
      id: i.id,
      incidentType: i.incident_type,
      description: i.description,
      status: i.status,
      createdAt: i.created_at,
    })),
    housekeepingDetail: hkRow
      ? {
          status: hkRow.status,
          priorityLevel: hkRow.priority_level,
          dueBy: hkRow.due_by,
          updatedAt: hkRow.updated_at,
        }
      : null,
  };
}

export async function getRoomHistory(params: {
  tenantId: string;
  roomUnitId: string;
}) {
  const supabase = createServerSupabaseClient();
  const roomId = params.roomUnitId;

  const [auditDirect, auditRoomMoves, pastStaysResult, hkHistoryResult, roomIncidentsResult] =
    await Promise.all([
      supabase
        .schema("hotel")
        .from("audit_logs")
        .select("id,actor_user_id,action,entity_type,entity_id,before_state,after_state,created_at")
        .eq("tenant_id", params.tenantId)
        .eq("entity_id", roomId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .schema("hotel")
        .from("audit_logs")
        .select("id,actor_user_id,action,entity_type,entity_id,before_state,after_state,created_at")
        .eq("tenant_id", params.tenantId)
        .or(
          `after_state->>room_unit_id.eq.${roomId},before_state->>room_unit_id.eq.${roomId}`,
        )
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .schema("hotel")
        .from("reservations")
        .select("id,confirmation_code,status,arrival_at,departure_at,checked_in_at,checked_out_at")
        .eq("tenant_id", params.tenantId)
        .eq("room_unit_id", roomId)
        .order("departure_at", { ascending: false })
        .limit(15),
      supabase
        .schema("hotel")
        .from("housekeeping_tasks")
        .select("status,priority_level,updated_at,notes")
        .eq("tenant_id", params.tenantId)
        .eq("room_unit_id", roomId)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .schema("hotel")
        .from("room_incidents")
        .select("id,incident_type,description,status,created_at")
        .eq("tenant_id", params.tenantId)
        .eq("room_unit_id", roomId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  type AuditRow = {
    id: string;
    actor_user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    before_state: unknown;
    after_state: unknown;
    created_at: string;
  };

  const auditById = new Map<string, AuditRow>();
  for (const row of (auditDirect.data ?? []) as AuditRow[]) auditById.set(row.id, row);
  for (const row of (auditRoomMoves.data ?? []) as AuditRow[]) auditById.set(row.id, row);
  const auditRows = [...auditById.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const actorIds = auditRows.map((a) => a.actor_user_id).filter((id): id is string => Boolean(id));
  const nameByUser = await profileNameMap(supabase, params.tenantId, actorIds);

  const audit = auditRows.map((a) => ({
    id: a.id,
    message: formatAuditMessage({
      actorName: a.actor_user_id ? nameByUser.get(a.actor_user_id) ?? "Staff" : "System",
      action: a.action,
      entityType: a.entity_type,
      before: a.before_state as Record<string, unknown> | null,
      after: a.after_state as Record<string, unknown> | null,
      createdAt: a.created_at,
    }),
    createdAt: a.created_at,
  }));

  const pastStays = pastStaysResult.data;
  const hkHistory = hkHistoryResult.data;
  const roomIncidents = roomIncidentsResult.data;

  const hkCleans = (hkHistory ?? []).map((h) => ({
    id: `hk-${h.updated_at}`,
    status: h.status,
    priorityLevel: h.priority_level,
    notes: h.notes,
    updatedAt: h.updated_at,
  }));

  return {
    audit,
    pastStays: (pastStays ?? []).map((s) => ({
      id: s.id,
      confirmationCode: s.confirmation_code,
      status: s.status,
      arrivalAt: s.arrival_at,
      departureAt: s.departure_at,
    })),
    hkCleans,
    incidents: (roomIncidents ?? []).map((i) => ({
      id: i.id,
      incidentType: i.incident_type,
      description: i.description,
      status: i.status,
      createdAt: i.created_at,
    })),
  };
}

export { mapRoomReadiness, formatPricingAmount };
