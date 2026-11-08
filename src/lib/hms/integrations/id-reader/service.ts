import type { SupabaseClient } from "@supabase/supabase-js";
import { logIntegrationEvent } from "../connections";
import { createClaudeVisionReader } from "./adapters/claude-vision";
import type { IdReader, IdReadImage, IdReadResult } from "./types";
import { ID_PHOTO_BUCKET } from "@/lib/hms/id-photos";

/*
 * The one place that decides which ID reader is used. To switch: write a new adapter next to
 * claude-vision.ts, return it here, and nothing else in the code changes.
 */

let override: IdReader | null = null;
/** Tests put a fake reader here. */
export function setIdReaderForTests(r: IdReader | null) {
  override = r;
}

export function idReaderAvailable(): boolean {
  return override !== null || Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function getIdReader(): IdReader {
  return override ?? createClaudeVisionReader();
}

/**
 * Reads the ID photos already saved on a booking and returns what they show. It saves nothing to the
 * guest: the screen shows the proposal and staff accept it. Photos are sent to the reader only now,
 * on a staff click, never in the background.
 */
export async function readIdForReservation(
  db: SupabaseClient,
  input: { tenantId: string; reservationId: string },
  reader: IdReader = getIdReader(),
): Promise<IdReadResult> {
  const { data, error } = await db
    .schema("hotel")
    .from("reservation_id_photos")
    .select("storage_path,content_type,side,created_at")
    .eq("tenant_id", input.tenantId)
    .eq("reservation_id", input.reservationId)
    .order("created_at", { ascending: true })
    .limit(6);
  if (error) return { ok: false, error: "Could not load the ID photos.", retryable: true };
  const rows = (data ?? []) as { storage_path: string; content_type: string; side: string }[];
  if (rows.length === 0) return { ok: false, error: "Take a photo of the ID first.", retryable: false };
  // Front first, so the reader sees the face of the document before the back.
  rows.sort((a, b) => (a.side === b.side ? 0 : a.side === "front" ? -1 : 1));

  const images: IdReadImage[] = [];
  for (const r of rows.slice(0, 2)) {
    const file = await db.storage.from(ID_PHOTO_BUCKET).download(r.storage_path);
    if (file.error || !file.data) return { ok: false, error: "Could not open an ID photo.", retryable: true };
    images.push({ bytes: new Uint8Array(await file.data.arrayBuffer()), mime: r.content_type });
  }

  const startedAt = Date.now();
  const result = await reader.readId(images);
  await logIntegrationEvent(db, {
    tenantId: input.tenantId,
    kind: "id_reader",
    provider: reader.id,
    action: "read_id",
    ok: result.ok,
    error: result.ok ? null : result.error,
    startedAt,
    ref: input.reservationId,
  });
  return result;
}
