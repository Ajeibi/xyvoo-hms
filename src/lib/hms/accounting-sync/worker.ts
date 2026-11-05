import type { SupabaseClient } from "@supabase/supabase-js";
import { PROVIDER, createTokenStore, getConnectionRow, toPublicConnection } from "@/lib/hms/accounting-sync/connection";
import { DriverError } from "@/lib/hms/accounting-sync/driver";
import { loadAccountMap } from "@/lib/hms/accounting-sync/mapping";
import { processJournal } from "@/lib/hms/accounting-sync/process";
import { claimDue, markFailed, markRetry, markSendStarted, markSent, markSkipped, releaseClaim, queueCounts } from "@/lib/hms/accounting-sync/queue";
import { createSageDriver, loadSageConfig } from "@/lib/hms/accounting-sync/sage-accounting";
import { ensureAccessToken } from "@/lib/hms/accounting-sync/tokens";
import { getJournalEntryDetail } from "@/lib/hms/journal-entries";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

export type SyncRunResult = {
  sent: number;
  skipped: number;
  retrying: number;
  failed: number;
  stopped: "rate_limited" | "auth" | "time" | null;
  note?: string;
};

const EMPTY: SyncRunResult = { sent: 0, skipped: 0, retrying: 0, failed: 0, stopped: null };

/** Sends one hotel's due journals to Sage. Safe to call concurrently: rows are leased before use. */
export async function runSyncForTenant(
  service: SupabaseClient,
  tenantId: string,
  opts: { limit?: number; budgetMs?: number } = {},
): Promise<SyncRunResult> {
  const result: SyncRunResult = { ...EMPTY };
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;

  const conn = await getConnectionRow(service, tenantId);
  if (!conn || conn.status !== "connected" || !conn.external_business_id) return { ...result, note: "not connected" };

  const claimed = await claimDue(service, tenantId, opts.limit ?? 40);
  if (claimed.length === 0) return result;

  const driver = createSageDriver(loadSageConfig());
  let accessToken: string;
  try {
    accessToken = await ensureAccessToken(createTokenStore(service, tenantId), driver);
  } catch (e) {
    for (const row of claimed) await releaseClaim(service, row, 15 * 60_000);
    const auth = e instanceof DriverError && e.kind === "auth";
    return { ...result, stopped: auth ? "auth" : "time", note: auth ? "Sage needs to be reconnected" : "could not refresh Sage token" };
  }

  const ctx = { accessToken, businessId: conn.external_business_id };
  const { data: tenant } = await service.from("tenants").select("pricing_setup").eq("id", tenantId).maybeSingle();
  const hotelCurrency = normalizePricingSetup(tenant?.pricing_setup).currency ?? null;
  const accountMap = new Map((await loadAccountMap(service, tenantId)).map((m) => [m.accountCode, m.externalAccountId]));

  for (let i = 0; i < claimed.length; i += 1) {
    const row = claimed[i];
    if (Date.now() - started > budget || result.stopped) {
      await releaseClaim(service, row, 0);
      result.stopped ??= "time";
      continue;
    }

    const journal = await getJournalEntryDetail(service, tenantId, row.journalEntryId);
    const outcome = await processJournal(
      {
        driver,
        ctx,
        journal: journal
          ? {
              id: journal.id,
              entryDate: journal.entryDate,
              memo: journal.memo,
              lines: journal.lines.map((l) => ({
                accountCode: l.accountCode,
                accountName: l.accountName,
                debit: l.debit,
                credit: l.credit,
                description: l.description ?? null,
                department: l.department ?? null,
              })),
            }
          : null,
        accountMap,
        hotelCurrency,
        businessCurrency: conn.external_currency,
        onSendStart: () => markSendStarted(service, row.id),
      },
      row,
    );

    switch (outcome.kind) {
      case "sent":
        await markSent(service, row, outcome.externalId);
        result.sent += 1;
        break;
      case "skipped":
        await markSkipped(service, row, outcome.reason);
        result.skipped += 1;
        break;
      case "retry":
        await markRetry(service, row, outcome.error, outcome.retryAfterMs);
        result.retrying += 1;
        break;
      case "failed":
        await markFailed(service, row, outcome.error);
        result.failed += 1;
        break;
      case "rate_limited":
        await releaseClaim(service, row, outcome.retryAfterMs ?? 60_000, "Sage rate limit reached; will retry.");
        result.stopped = "rate_limited";
        break;
      case "auth":
        await releaseClaim(service, row, 15 * 60_000);
        await service
          .schema("hotel")
          .from("accounting_connections")
          .update({ status: "needs_reauth", last_error: "Sage rejected the connection. Connect Sage again.", updated_at: new Date().toISOString() })
          .eq("tenant_id", tenantId)
          .eq("provider", PROVIDER);
        result.stopped = "auth";
        break;
    }
  }
  return result;
}

/** Cron entry: every hotel with a live connection. */
export async function runSyncForAll(service: SupabaseClient): Promise<{ hotels: number; sent: number; failed: number }> {
  const { data } = await service
    .schema("hotel")
    .from("accounting_connections")
    .select("tenant_id")
    .eq("provider", PROVIDER)
    .eq("status", "connected");
  let sent = 0;
  let failed = 0;
  const tenants = (data ?? []) as { tenant_id: string }[];
  for (const t of tenants) {
    try {
      const r = await runSyncForTenant(service, t.tenant_id, { limit: 100, budgetMs: 40_000 });
      sent += r.sent;
      failed += r.failed;
    } catch (e) {
      console.warn("[accounting-sync] hotel run failed:", e instanceof Error ? e.message : "unknown");
    }
  }
  return { hotels: tenants.length, sent, failed };
}

export async function getSyncOverview(service: SupabaseClient, tenantId: string) {
  const [row, counts] = await Promise.all([getConnectionRow(service, tenantId), queueCounts(service, tenantId)]);
  return { connection: toPublicConnection(row), counts };
}
