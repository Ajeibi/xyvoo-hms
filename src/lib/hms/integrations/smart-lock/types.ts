export type SmartLockProviderMode = "audit_only" | "mock" | "http_webhook";

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
