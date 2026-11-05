import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { enqueueJournal } from "@/lib/hms/accounting-sync/queue";

/**
 * Called by postJournalEntry after a journal is saved. It only ever QUEUES the journal and then makes a
 * best-effort attempt in the background; it never calls Sage inline and never throws, so a Sage outage
 * cannot block or fail a posting. Anything that does not go through stays queued for the daily cron.
 */
export async function queueJournalForAccountingSync(
  service: SupabaseClient,
  params: { tenantId: string; journalEntryId: string; entryDate: string },
): Promise<void> {
  try {
    const queued = await enqueueJournal(service, params);
    if (!queued) return;
    const attempt = async () => {
      try {
        const { runSyncForTenant } = await import("@/lib/hms/accounting-sync/worker");
        await runSyncForTenant(service, params.tenantId, { limit: 10, budgetMs: 20_000 });
      } catch {
        /* stays queued */
      }
    };
    try {
      after(attempt);
    } catch {
      // Outside a request (a script or a test): fire and forget.
      void attempt();
    }
  } catch {
    /* never fail a posting */
  }
}
