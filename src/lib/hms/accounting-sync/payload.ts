import type { SyncJournal, SyncJournalLine } from "@/lib/hms/accounting-sync/driver";

/** Money is handled as integer cents end to end, so there is no float drift and the journal balances exactly. */
export function toCents(value: number): number {
  return Math.round((Number(value) || 0) * 100);
}

export function centsToAmount(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/** Short, stable Sage reference built from the XYVOO journal id. */
export function sageReference(journalEntryId: string): string {
  return `XYV-${journalEntryId}`;
}

export type JournalForSync = {
  id: string;
  entryDate: string;
  memo: string;
  lines: { accountCode: string; accountName: string; debit: number; credit: number; description: string | null; department: string | null }[];
};

export type BuildResult =
  | { ok: true; journal: SyncJournal }
  | { ok: false; reason: string; unmappedCodes: string[] };

/**
 * Turns a XYVOO journal into the provider-neutral shape. If ANY account is unmapped, or the lines do not
 * balance to the cent, nothing is built: the journal is skipped, never half-sent.
 */
export function buildSyncJournal(entry: JournalForSync, accountMap: ReadonlyMap<string, string>): BuildResult {
  const unmapped = [...new Set(entry.lines.map((l) => l.accountCode).filter((code) => !accountMap.get(code)))];
  if (unmapped.length > 0) {
    return { ok: false, reason: `unmapped account ${unmapped.join(", ")}`, unmappedCodes: unmapped };
  }

  const lines: SyncJournalLine[] = entry.lines.map((l) => {
    const detail = [l.description, l.department].filter(Boolean).join(" · ") || l.accountName;
    return {
      externalAccountId: accountMap.get(l.accountCode) as string,
      debitCents: toCents(l.debit),
      creditCents: toCents(l.credit),
      details: detail.slice(0, 200),
    };
  });

  const debit = lines.reduce((s, l) => s + l.debitCents, 0);
  const credit = lines.reduce((s, l) => s + l.creditCents, 0);
  if (debit !== credit) {
    return { ok: false, reason: `journal does not balance (debits ${centsToAmount(debit)} vs credits ${centsToAmount(credit)})`, unmappedCodes: [] };
  }
  if (lines.length < 2 || debit === 0) {
    return { ok: false, reason: "journal has no amounts to send", unmappedCodes: [] };
  }

  return {
    ok: true,
    journal: {
      id: entry.id,
      date: entry.entryDate,
      reference: sageReference(entry.id),
      description: entry.memo.slice(0, 200),
      lines,
    },
  };
}
