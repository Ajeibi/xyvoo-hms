import type { LockProviderId } from "../locks/types";

/** Kept for the older callers; the full list of brands now lives in ../locks/types. */
export type SmartLockProviderMode = LockProviderId;

export type SmartLockTenantConfig = {
  provider?: SmartLockProviderMode;
  apiBaseUrl?: string;
  apiKey?: string;
  roomIdMap?: Record<string, string>;
};

export type SmartLockResult = {
  mode: SmartLockProviderMode;
  executed: boolean;
  message: string;
  metadata?: Record<string, unknown>;
};
