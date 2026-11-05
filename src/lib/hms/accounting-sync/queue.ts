import type { SupabaseClient } from "@supabase/supabase-js";
import { PROVIDER, getConnectionRow } from "@/lib/hms/accounting-sync/connection";
import { decideAfterFailure } from "@/lib/hms/accounting-sync/policy";

export type QueueStatus = "pending" | "sent" | "failed" | "skipped";

export type QueueRow = {
  id: string;
  journalEntryId: string;
  status: QueueStatus;
  attempts: number;
  sendStartedAt: string | null;
  externalId: string | null;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  nextAttemptAt: string | null;
  entryDate?: string | null;
  memo?: string | null;
};

const CLAIM_MS = 5 * 60_000;
const table = (service: SupabaseClient) => service.schema("hotel").from("accounting_sync_queue");

/**
 * Adds a posted journal to the queue if (and only if) this hotel has a live connection and the journal
 * is dated on/after the "sync from" day. Never throws: a queue problem must not fail a posting.
 * Returns true when a new row was queued.
 */
export async function enqueueJournal(
  service: SupabaseClient,
  params: { tenantId: string; journalEntryId: string; entryDate: string },
): Promise<boolean> {
  try {
    const conn = await getConnectionRow(service, params.tenantId);
    if (!conn || conn.status !== "connected" || !conn.external_business_id) return false;
    if (params.entryDate < conn.sync_from) return false;
    const { data, error } = await table(service)
      .upsert(
        { tenant_id: params.tenantId, provider: PROVIDER, journal_entry_id: params.journalEntryId, status: "pending", next_attempt_at: new Date().toISOString() },
        { onConflict: "tenant_id,provider,journal_entry_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      console.warn("[accounting-sync] enqueue failed:", error.message);
      return false;
    }
    return (data ?? []).length > 0;
  } catch (e) {
    console.warn("[accounting-sync] enqueue failed:", e instanceof Error ? e.message : "unknown");
    return false;
  }
}

/** Claims up to `limit` due rows (a short lease stops two workers taking the same one). */
export async function claimDue(service: SupabaseClient, tenantId: string, limit: number): Promise<QueueRow[]> {
  const now = new Date();
  const { data } = await table(service)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER)
    .eq("status", "pending")
    .lte("next_attempt_at", now.toISOString())
    .or(`claimed_until.is.null,claimed_until.lt.${now.toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  const claimed: QueueRow[] = [];
  for (const { id } of (data ?? []) as { id: string }[]) {
    const { data: got } = await table(service)
      .update({ claimed_until: new Date(now.getTime() + CLAIM_MS).toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .or(`claimed_until.is.null,claimed_until.lt.${now.toISOString()}`)
      .select("id,journal_entry_id,status,attempts,send_started_at,external_id,last_error,created_at,sent_at,next_attempt_at");
    if (got && got[0]) claimed.push(mapRow(got[0]));
  }
  return claimed;
}

function mapRow(r: Record<string, unknown>): QueueRow {
  return {
    id: r.id as string,
    journalEntryId: r.journal_entry_id as string,
    status: r.status as QueueStatus,
    attempts: Number(r.attempts) || 0,
    sendStartedAt: (r.send_started_at as string | null) ?? null,
    externalId: (r.external_id as string | null) ?? null,
    lastError: (r.last_error as string | null) ?? null,
    createdAt: r.created_at as string,
    sentAt: (r.sent_at as string | null) ?? null,
    nextAttemptAt: (r.next_attempt_at as string | null) ?? null,
  };
}

/** Recorded just before the request goes out: if the process dies mid-send, the retry checks Sage first. */
export async function markSendStarted(service: SupabaseClient, id: string) {
  await table(service).update({ send_started_at: new Date().toISOString() }).eq("id", id);
}

export async function markSent(service: SupabaseClient, row: QueueRow, externalId: string) {
  await table(service)
    .update({ status: "sent", external_id: externalId, sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null, claimed_until: null, next_attempt_at: null })
    .eq("id", row.id);
}

export async function markSkipped(service: SupabaseClient, row: QueueRow, reason: string) {
  await table(service).update({ status: "skipped", last_error: reason, claimed_until: null, next_attempt_at: null }).eq("id", row.id);
}

/** Retryable failure: back off, or stop (status failed) once attempts run out. */
export async function markRetry(service: SupabaseClient, row: QueueRow, error: string, retryAfterMs?: number | null) {
  const d = decideAfterFailure(row.attempts, new Date(), retryAfterMs);
  await table(service)
    .update({ status: d.status, attempts: d.attempts, next_attempt_at: d.nextAttemptAt, last_error: error.slice(0, 500), claimed_until: null })
    .eq("id", row.id);
}

/** Permanent failure (Sage refused the data): no automatic retry. */
export async function markFailed(service: SupabaseClient, row: QueueRow, error: string) {
  await table(service)
    .update({ status: "failed", attempts: row.attempts + 1, next_attempt_at: null, last_error: error.slice(0, 500), claimed_until: null })
    .eq("id", row.id);
}

/** Rate limited or token trouble: hand the row back without using up an attempt. */
export async function releaseClaim(service: SupabaseClient, row: QueueRow, retryAfterMs: number, note?: string) {
  await table(service)
    .update({ claimed_until: null, next_attempt_at: new Date(Date.now() + Math.max(retryAfterMs, 30_000)).toISOString(), ...(note ? { last_error: note } : {}) })
    .eq("id", row.id);
}

/** After a mapping save: journals that were waiting on an account get another go. Returns how many. */
export async function requeueUnmapped(service: SupabaseClient, tenantId: string): Promise<number> {
  const { data } = await table(service)
    .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), claimed_until: null })
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER)
    .eq("status", "skipped")
    .like("last_error", "unmapped account%")
    .select("id");
  return (data ?? []).length;
}

/** Manual retry of one row, or of every failed/skipped row when `id` is omitted. */
export async function retryRows(service: SupabaseClient, tenantId: string, id?: string): Promise<number> {
  let q = table(service)
    .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), claimed_until: null })
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER);
  q = id ? q.eq("id", id).in("status", ["failed", "skipped"]) : q.eq("status", "failed");
  const { data } = await q.select("id");
  return (data ?? []).length;
}

/** Stops queued work when a hotel disconnects. */
export async function skipOpenRows(service: SupabaseClient, tenantId: string, reason: string) {
  await table(service)
    .update({ status: "skipped", last_error: reason, claimed_until: null, next_attempt_at: null })
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER)
    .in("status", ["pending", "failed"]);
}

/** User-triggered: queue journals already posted on/after the sync-from date (not automatic). */
export async function queueExistingJournals(service: SupabaseClient, tenantId: string): Promise<number> {
  const conn = await getConnectionRow(service, tenantId);
  if (!conn || conn.status !== "connected") return 0;
  const { data: entries } = await service
    .schema("hotel")
    .from("journal_entries")
    .select("id")
    .eq("tenant_id", tenantId)
    .gte("entry_date", conn.sync_from)
    .limit(5000);
  const rows = ((entries ?? []) as { id: string }[]).map((e) => ({
    tenant_id: tenantId,
    provider: PROVIDER,
    journal_entry_id: e.id,
    status: "pending",
    next_attempt_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return 0;
  const { data } = await table(service).upsert(rows, { onConflict: "tenant_id,provider,journal_entry_id", ignoreDuplicates: true }).select("id");
  return (data ?? []).length;
}

export async function listQueue(
  service: SupabaseClient,
  tenantId: string,
  opts: { status?: QueueStatus | null; limit?: number } = {},
): Promise<QueueRow[]> {
  let q = table(service)
    .select("id,journal_entry_id,status,attempts,send_started_at,external_id,last_error,created_at,sent_at,next_attempt_at,journal_entries(entry_date,memo)")
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  const { data } = await q;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const je = r.journal_entries as { entry_date?: string; memo?: string } | { entry_date?: string; memo?: string }[] | null;
    const j = Array.isArray(je) ? je[0] : je;
    return { ...mapRow(r), entryDate: j?.entry_date ?? null, memo: j?.memo ?? null };
  });
}

export async function queueCounts(service: SupabaseClient, tenantId: string): Promise<Record<QueueStatus, number>> {
  const out: Record<QueueStatus, number> = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  await Promise.all(
    (Object.keys(out) as QueueStatus[]).map(async (status) => {
      const { count } = await table(service)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("provider", PROVIDER)
        .eq("status", status);
      out[status] = count ?? 0;
    }),
  );
  return out;
}
