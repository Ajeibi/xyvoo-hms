/**
 * Provider-neutral contract for pushing XYVOO journals to an external accounting system.
 * Only the Sage Accounting driver exists today; QuickBooks, Xero etc. would implement this too.
 */

export type DriverProvider = "sage_accounting";

export type SyncJournalLine = {
  /** External ledger account id (already mapped). */
  externalAccountId: string;
  /** Integer cents. Exactly one of debitCents / creditCents is > 0. */
  debitCents: number;
  creditCents: number;
  details: string;
};

export type SyncJournal = {
  /** XYVOO journal entry id, used as the idempotency reference. */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  reference: string;
  description: string;
  lines: SyncJournalLine[];
};

export type ExternalAccount = { id: string; code: string | null; name: string; type: string | null };
export type ExternalTaxRate = { id: string; name: string; percentage: number | null };
export type ExternalBusiness = { id: string; name: string; currency: string | null };

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Seconds until the refresh token expires, when the provider says. */
  refreshExpiresIn: number | null;
};

export type DriverContext = { accessToken: string; businessId: string };

export type DriverErrorKind = "auth" | "rate_limit" | "permanent" | "transient";

export class DriverError extends Error {
  constructor(
    public readonly kind: DriverErrorKind,
    message: string,
    public readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "DriverError";
  }
}

export interface AccountingDriver {
  readonly provider: DriverProvider;
  /** Creates the journal in the external system and returns its id there. */
  pushJournal(ctx: DriverContext, journal: SyncJournal): Promise<{ externalId: string }>;
  /** Looks for a journal already created with this reference, so a retry never duplicates. */
  findJournalByReference(ctx: DriverContext, reference: string, date: string): Promise<{ externalId: string } | null>;
  listAccounts(ctx: DriverContext): Promise<ExternalAccount[]>;
  listTaxRates(ctx: DriverContext): Promise<ExternalTaxRate[]>;
  /** Exchanges a refresh token for a new token set. The old refresh token must be considered spent. */
  refreshAuth(refreshToken: string): Promise<TokenSet>;
}
