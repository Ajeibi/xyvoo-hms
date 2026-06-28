import type { SupabaseClient } from "@supabase/supabase-js";
import { getFloorPlanRoomTotal, type HotelFloorPlanEntry } from "@/lib/hms/floor-plan";

export type ApplyFloorPlanToRoomUnitsResult =
  | { ok: true; updatedCount: number; codeUpdatesCount: number }
  | { ok: false; error: string };

const TMP_PREFIX = "__xyv_fp_tmp:";

/** Parallel batch size for per-row updates (sequential was one RTT per key → tens of seconds at scale). */
const UPDATE_CONCURRENCY = 24;

async function runBatchedUpdates<T>(
  items: readonly T[],
  batchSize: number,
  worker: (item: T) => Promise<{ error?: string }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const results = await Promise.all(chunk.map((item) => worker(item)));
    const errMsg = results.find((r) => r.error)?.error;
    if (errMsg) return { ok: false, error: errMsg };
  }
  return { ok: true };
}

/**
 * Writes `hotel.room_units.floor` from the canonical tenant `floor_plan`.
 * Optionally writes `room_code` when each plan row includes `room_codes` with length === room_count.
 * - Empty plan: every key is set to floor 1 (ground).
 * - Non-empty plan: keys are sorted by `room_code` (numeric-aware), then consecutive
 *   segments receive each plan row's floor for `room_count` keys.
 */
export async function applyFloorPlanToRoomUnits(
  supabase: SupabaseClient,
  tenantId: string,
  plan: HotelFloorPlanEntry[],
): Promise<ApplyFloorPlanToRoomUnitsResult> {
  const { data: rows, error } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("id, room_code")
    .eq("tenant_id", tenantId);

  if (error) {
    return { ok: false, error: error.message };
  }

  const units = rows ?? [];
  if (units.length === 0) {
    return { ok: true, updatedCount: 0, codeUpdatesCount: 0 };
  }

  if (plan.length === 0) {
    const { error: uerr } = await supabase
      .schema("hotel")
      .from("room_units")
      .update({ floor: 1 })
      .eq("tenant_id", tenantId);

    if (uerr) {
      return { ok: false, error: uerr.message };
    }
    return { ok: true, updatedCount: units.length, codeUpdatesCount: 0 };
  }

  const totalPlanned = getFloorPlanRoomTotal(plan);
  if (totalPlanned !== units.length) {
    return {
      ok: false,
      error: `Floor plan allocates ${totalPlanned} rooms but this property has ${units.length} room keys in inventory. Those counts must match before floors can be applied to keys.`,
    };
  }

  const sorted = [...units].sort((a, b) =>
    String(a.room_code).localeCompare(String(b.room_code), undefined, { numeric: true }),
  );

  const floorAssignments: { id: string; floor: number }[] = [];
  const codeChanges: { id: string; code: string }[] = [];

  let idx = 0;
  for (const seg of plan) {
    const slice = sorted.slice(idx, idx + seg.room_count);
    if (slice.length !== seg.room_count) {
      return { ok: false, error: "Internal error while assigning floors to room keys." };
    }
    for (const row of slice) {
      floorAssignments.push({ id: row.id, floor: seg.floor });
    }

    if (seg.room_codes && seg.room_codes.length === seg.room_count) {
      for (let i = 0; i < slice.length; i += 1) {
        const u = slice[i]!;
        const next = seg.room_codes[i]!;
        if (u.room_code !== next) {
          codeChanges.push({ id: u.id, code: next });
        }
      }
    }
    idx += seg.room_count;
  }

  if (idx !== sorted.length) {
    return { ok: false, error: "Internal error: floor plan segment sizes do not match inventory." };
  }

  const floorResult = await runBatchedUpdates(
    floorAssignments,
    UPDATE_CONCURRENCY,
    async ({ id, floor }) => {
      const { error: rowErr } = await supabase
        .schema("hotel")
        .from("room_units")
        .update({ floor })
        .eq("id", id);
      return { error: rowErr?.message };
    },
  );
  if (!floorResult.ok) {
    return { ok: false, error: floorResult.error };
  }

  let codeUpdatesCount = 0;
  if (codeChanges.length > 0) {
    const finalById = new Map(units.map((u) => [u.id, u.room_code]));
    for (const { id, code } of codeChanges) {
      finalById.set(id, code);
    }
    const seen = new Set<string>();
    for (const code of finalById.values()) {
      if (seen.has(code)) {
        return {
          ok: false,
          error: `Room numbers would duplicate "${code}" on two keys. Adjust the floor plan numbering.`,
        };
      }
      seen.add(code);
    }

    const tmpResult = await runBatchedUpdates(
      codeChanges,
      UPDATE_CONCURRENCY,
      async ({ id }) => {
        const { error: e1 } = await supabase
          .schema("hotel")
          .from("room_units")
          .update({ room_code: `${TMP_PREFIX}${id}` })
          .eq("tenant_id", tenantId)
          .eq("id", id);
        return { error: e1?.message };
      },
    );
    if (!tmpResult.ok) {
      return { ok: false, error: tmpResult.error };
    }

    const finalResult = await runBatchedUpdates(
      codeChanges,
      UPDATE_CONCURRENCY,
      async ({ id, code }) => {
        const { error: e2 } = await supabase
          .schema("hotel")
          .from("room_units")
          .update({ room_code: code })
          .eq("tenant_id", tenantId)
          .eq("id", id);
        return { error: e2?.message };
      },
    );
    if (!finalResult.ok) {
      return { ok: false, error: finalResult.error };
    }
    codeUpdatesCount = codeChanges.length;
  }

  return { ok: true, updatedCount: floorAssignments.length, codeUpdatesCount };
}
