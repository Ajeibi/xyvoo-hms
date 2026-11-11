/*
 * The door lock contract. Nothing here names a brand. Every brand (TTLock today; Salto and ASSA ABLOY
 * VingCard later) is one adapter file in ./adapters that implements `LockProvider`, registered in
 * ./registry.ts. The rest of the app only ever calls ./service.ts. Safe for the browser and the server.
 */

export const LOCK_PROVIDER_IDS = ["audit_only", "mock", "http_webhook", "ttlock"] as const;
export type LockProviderId = (typeof LOCK_PROVIDER_IDS)[number];

export type LockProviderInfo = {
  id: LockProviderId;
  label: string;
  /** What the hotel must have before this works, in plain words. */
  needs: string;
  /** True when the brand manages its own login and lock list (so staff connect and match locks). */
  hasCloudAccount: boolean;
};

export const LOCK_PROVIDERS: LockProviderInfo[] = [
  { id: "audit_only", label: "Record only (no hardware)", needs: "Nothing. Key events are only written to the log.", hasCloudAccount: false },
  { id: "ttlock", label: "TTLock", needs: "A TTLock account that owns the locks, and a TTLock gateway for remote codes.", hasCloudAccount: true },
  { id: "http_webhook", label: "Your own lock server (HTTP)", needs: "A server on your side that accepts unlock, revoke and reissue calls.", hasCloudAccount: false },
  { id: "mock", label: "Practice mode", needs: "Nothing. Pretends to work so staff can practise.", hasCloudAccount: false },
];

export type LockResult<T = Record<string, never>> =
  | { ok: true; data: T }
  /** `retryable` is true for network faults, rate limits and server errors; a rejected request is not. */
  | { ok: false; error: string; retryable: boolean };

export type ProviderLock = {
  externalLockId: string;
  label: string;
  /** Battery percentage when the brand reports it. */
  battery: number | null;
};

export type IssueCodeInput = {
  externalLockId: string;
  /** Our own code, when the brand lets us choose it. The adapter returns the code actually set. */
  code: string;
  startsAt: Date;
  endsAt: Date;
  /** Shown in the brand's own app next to the code. */
  label: string;
};

export type IssuedCode = { externalCodeId: string | null; code: string };

export interface LockProvider {
  readonly id: LockProviderId;
  testConnection(): Promise<LockResult<{ lockCount: number }>>;
  listLocks(): Promise<LockResult<{ locks: ProviderLock[] }>>;
  issueCode(input: IssueCodeInput): Promise<LockResult<IssuedCode>>;
  revokeCode(input: { externalLockId: string; externalCodeId: string | null }): Promise<LockResult>;
  remoteUnlock(input: { externalLockId: string }): Promise<LockResult>;
}

/** What a hotel has chosen, as kept in `hotel.integration_connections` (non-secret part). */
export type LockConnectionConfig = {
  /** TTLock: the hotel has a gateway, so codes can be set remotely. */
  hasGateway?: boolean;
  /** http_webhook */
  apiBaseUrl?: string;
};
