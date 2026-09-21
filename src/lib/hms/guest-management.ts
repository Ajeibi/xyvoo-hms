import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

export const GUEST_TAGS = ["vip", "do_not_walk"] as const;
export type GuestTag = (typeof GUEST_TAGS)[number];

export type GuestNoteRow = {
  id: string;
  note: string;
  createdByName: string;
  createdAt: string;
};

function normalizeTags(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
}

/**
 * Adds or removes a tag on a guest's persistent record (hotel.guests.tags) — the same field
 * guestHasVipTag() already reads, so VIP/Do Not Walk set here immediately show up everywhere
 * that already checks tags (guest directory, arrivals workbench isVip computation).
 */
export async function setGuestTag(
  service: SupabaseClient,
  params: { tenantId: string; guestId: string; tag: GuestTag; enabled: boolean; actorUserId: string },
): Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> {
  const { data: guest, error: fetchError } = await service
    .schema("hotel")
    .from("guests")
    .select("tags")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.guestId)
    .maybeSingle();

  if (fetchError || !guest) return { ok: false, error: "Guest not found." };

  const current = normalizeTags(guest.tags);
  const withoutTag = current.filter((t) => t.toLowerCase() !== params.tag);
  const nextTags = params.enabled ? [...withoutTag, params.tag] : withoutTag;

  const { error: updateError } = await service
    .schema("hotel")
    .from("guests")
    .update({ tags: nextTags })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.guestId);

  if (updateError) return { ok: false, error: updateError.message };

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: params.enabled ? "guest_tag_added" : "guest_tag_removed",
    entityType: "guest",
    entityId: params.guestId,
    after: { tag: params.tag },
  });

  return { ok: true, tags: nextTags };
}

export async function listGuestNotes(
  service: SupabaseClient,
  tenantId: string,
  guestId: string,
): Promise<GuestNoteRow[]> {
  const { data: notes } = await service
    .schema("hotel")
    .from("guest_notes")
    .select("id,note,created_by,created_at")
    .eq("tenant_id", tenantId)
    .eq("guest_id", guestId)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = notes ?? [];
  const authorIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is string => Boolean(id)))];

  const nameByUser = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await service
      .schema("hotel")
      .from("profiles")
      .select("user_id,contact_name")
      .eq("tenant_id", tenantId)
      .in("user_id", authorIds);
    for (const p of profiles ?? []) {
      if (p.contact_name) nameByUser.set(p.user_id as string, p.contact_name as string);
    }
  }

  return rows.map((r) => ({
    id: r.id as string,
    note: r.note as string,
    createdByName: (r.created_by && nameByUser.get(r.created_by as string)) || "Staff",
    createdAt: r.created_at as string,
  }));
}

export async function addGuestNote(
  service: SupabaseClient,
  params: { tenantId: string; guestId: string; note: string; authorUserId: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const note = params.note.trim();
  if (!note) return { ok: false, error: "Note cannot be empty." };

  const { data: guest } = await service
    .schema("hotel")
    .from("guests")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.guestId)
    .maybeSingle();
  if (!guest) return { ok: false, error: "Guest not found." };

  const { data: inserted, error } = await service
    .schema("hotel")
    .from("guest_notes")
    .insert({ tenant_id: params.tenantId, guest_id: params.guestId, note, created_by: params.authorUserId })
    .select("id")
    .single();

  if (error || !inserted) return { ok: false, error: error?.message ?? "Could not save note." };

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.authorUserId,
    action: "guest_note_added",
    entityType: "guest",
    entityId: params.guestId,
  });

  return { ok: true, id: inserted.id as string };
}
