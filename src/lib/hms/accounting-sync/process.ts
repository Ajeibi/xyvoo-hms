import { DriverError, type AccountingDriver, type DriverContext } from "@/lib/hms/accounting-sync/driver";
import { buildSyncJournal, sageReference, type JournalForSync } from "@/lib/hms/accounting-sync/payload";

/**
 * Decides what happens to ONE queued journal. Pure of the database: everything it needs comes in through
 * `deps`, so the idempotency, mapping and currency rules are unit-testable with a fake driver.
 */

export type ProcessDeps = {
  driver: Pick<AccountingDriver, "pushJournal" | "findJournalByReference">;
  ctx: DriverContext;
  journal: JournalForSync | null;
  accountMap: ReadonlyMap<string, string>;
  hotelCurrency: string | null;
  businessCurrency: string | null;
  /** Called right before the create request is sent. */
  onSendStart: () => Promise<void>;
};

export type ProcessRow = { sendStartedAt: string | null; externalId: string | null };

export type Outcome =
  | { kind: "sent"; externalId: string; alreadyThere: boolean }
  | { kind: "skipped"; reason: string }
  | { kind: "retry"; error: string; retryAfterMs: number | null }
  | { kind: "failed"; error: string }
  | { kind: "rate_limited"; retryAfterMs: number | null }
  | { kind: "auth"; error: string };

export async function processJournal(deps: ProcessDeps, row: ProcessRow): Promise<Outcome> {
  if (row.externalId) return { kind: "sent", externalId: row.externalId, alreadyThere: true };
  if (!deps.journal) return { kind: "skipped", reason: "journal no longer exists" };

  if (!deps.businessCurrency) {
    return { kind: "skipped", reason: "could not read the Sage business currency; reconnect Sage" };
  }
  if (!deps.hotelCurrency || deps.hotelCurrency.toUpperCase() !== deps.businessCurrency.toUpperCase()) {
    return {
      kind: "skipped",
      reason: `currency mismatch: hotel books in ${deps.hotelCurrency ?? "an unknown currency"}, Sage business in ${deps.businessCurrency}`,
    };
  }

  const built = buildSyncJournal(deps.journal, deps.accountMap);
  if (!built.ok) return { kind: "skipped", reason: built.reason };

  try {
    // A previous attempt may have reached Sage without us hearing back. Look before creating again.
    if (row.sendStartedAt) {
      const existing = await deps.driver.findJournalByReference(deps.ctx, sageReference(deps.journal.id), built.journal.date);
      if (existing) return { kind: "sent", externalId: existing.externalId, alreadyThere: true };
    }
    await deps.onSendStart();
    const { externalId } = await deps.driver.pushJournal(deps.ctx, built.journal);
    return { kind: "sent", externalId, alreadyThere: false };
  } catch (e) {
    if (!(e instanceof DriverError)) return { kind: "retry", error: e instanceof Error ? e.message : "Unknown error", retryAfterMs: null };
    switch (e.kind) {
      case "rate_limit":
        return { kind: "rate_limited", retryAfterMs: e.retryAfterMs };
      case "auth":
        return { kind: "auth", error: e.message };
      case "permanent":
        return { kind: "failed", error: e.message };
      default:
        return { kind: "retry", error: e.message, retryAfterMs: e.retryAfterMs };
    }
  }
}
