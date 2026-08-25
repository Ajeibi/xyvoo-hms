import type { SupabaseClient } from "@supabase/supabase-js";

export const LOST_FOUND_STATUSES = ["logged", "guest_notified", "returned", "disposed"] as const;
export type LostFoundStatus = (typeof LOST_FOUND_STATUSES)[number];

export type LostFoundItemRow = {
  id: string;
  /** Short per-tenant reference (e.g. "LF-0007") for writing on a physical tag/bag or reading
   * out to a guest on the phone — derived from found-order, not a stored column. */
  tag: string;
  roomCode: string | null;
  reservationId: string | null;
  description: string;
  photoUrl: string | null;
  status: LostFoundStatus;
  foundByName: string | null;
  foundAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
};

export async function listLostFoundItems(
  service: SupabaseClient,
  tenantId: string,
): Promise<LostFoundItemRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("lost_found_items")
    .select(
      "id,room_unit_id,reservation_id,description,photo_url,status,found_by,found_at,resolved_at,resolution_notes",
    )
    .eq("tenant_id", tenantId)
    .order("found_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    room_unit_id: string | null;
    reservation_id: string | null;
    description: string;
    photo_url: string | null;
    status: string;
    found_by: string;
    found_at: string;
    resolved_at: string | null;
    resolution_notes: string | null;
  }[];

  const roomIds = [...new Set(rows.map((r) => r.room_unit_id).filter((x): x is string => Boolean(x)))];
  const staffIds = [...new Set(rows.map((r) => r.found_by))];

  const [{ data: rooms }, { data: profiles }] = await Promise.all([
    roomIds.length > 0
      ? service.schema("hotel").from("room_units").select("id,room_code").eq("tenant_id", tenantId).in("id", roomIds)
      : Promise.resolve({ data: [] as { id: string; room_code: string }[] }),
    staffIds.length > 0
      ? service.schema("hotel").from("profiles").select("user_id,contact_name").eq("tenant_id", tenantId).in("user_id", staffIds)
      : Promise.resolve({ data: [] as { user_id: string; contact_name: string | null }[] }),
  ]);

  const roomCodeById = new Map<string, string>();
  for (const r of (rooms ?? []) as { id: string; room_code: string }[]) roomCodeById.set(r.id, r.room_code);
  const nameByUserId = new Map<string, string>();
  for (const p of (profiles ?? []) as { user_id: string; contact_name: string | null }[]) {
    if (p.contact_name) nameByUserId.set(p.user_id, p.contact_name);
  }

  /** Tag numbers are assigned by found-order (oldest = #1), independent of the DESC display
   * order above, so a tag stays stable as new items are logged. Only stable within the fetched
   * window (limit 200) — fine for a low-volume operational log. */
  const tagByRowId = new Map<string, string>();
  const byFoundOrder = [...rows].sort((a, b) => a.found_at.localeCompare(b.found_at) || a.id.localeCompare(b.id));
  byFoundOrder.forEach((r, i) => tagByRowId.set(r.id, `LF-${String(i + 1).padStart(4, "0")}`));

  return rows.map((r) => ({
    id: r.id,
    tag: tagByRowId.get(r.id) ?? "LF-????",
    roomCode: r.room_unit_id ? roomCodeById.get(r.room_unit_id) ?? null : null,
    reservationId: r.reservation_id,
    description: r.description,
    photoUrl: r.photo_url,
    status: r.status as LostFoundStatus,
    foundByName: nameByUserId.get(r.found_by) ?? "Staff",
    foundAt: r.found_at,
    resolvedAt: r.resolved_at,
    resolutionNotes: r.resolution_notes,
  }));
}

export async function createLostFoundItem(
  service: SupabaseClient,
  params: {
    tenantId: string;
    roomUnitId?: string | null;
    reservationId?: string | null;
    description: string;
    photoUrl?: string | null;
    foundByUserId: string;
  },
) {
  const { error } = await service.schema("hotel").from("lost_found_items").insert({
    tenant_id: params.tenantId,
    room_unit_id: params.roomUnitId ?? null,
    reservation_id: params.reservationId ?? null,
    description: params.description,
    photo_url: params.photoUrl ?? null,
    found_by: params.foundByUserId,
  });
  if (error) throw new Error(error.message);
}

export async function updateLostFoundItemStatus(
  service: SupabaseClient,
  params: { tenantId: string; itemId: string; status: LostFoundStatus; resolutionNotes?: string | null },
) {
  const isTerminal = params.status === "returned" || params.status === "disposed";
  const { error } = await service
    .schema("hotel")
    .from("lost_found_items")
    .update({
      status: params.status,
      resolution_notes: params.resolutionNotes ?? null,
      resolved_at: isTerminal ? new Date().toISOString() : null,
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.itemId);
  if (error) throw new Error(error.message);
}
