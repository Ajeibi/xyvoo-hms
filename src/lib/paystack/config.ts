import type { PaystackTenantConfig, PaystackTenantConfigPublic } from "./types";

function parsePaystackConfig(raw: unknown): PaystackTenantConfig {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    mode: o.mode === "live" ? "live" : o.mode === "test" ? "test" : undefined,
    publicKey: typeof o.publicKey === "string" ? o.publicKey : undefined,
    secretKey: typeof o.secretKey === "string" ? o.secretKey : undefined,
    webhookSecret: typeof o.webhookSecret === "string" ? o.webhookSecret : undefined,
  };
}

export function getPaystackConfig(tenant: { paystack_setup?: unknown }): PaystackTenantConfig {
  return parsePaystackConfig(tenant.paystack_setup);
}

export function getPaystackConfigPublic(tenant: { paystack_setup?: unknown }): PaystackTenantConfigPublic {
  const c = getPaystackConfig(tenant);
  return {
    enabled: c.enabled === true,
    mode: c.mode ?? "test",
    publicKey: c.publicKey ?? null,
    hasSecretKey: Boolean(c.secretKey),
    hasWebhookSecret: Boolean(c.webhookSecret),
  };
}

export function isPaystackReady(config: PaystackTenantConfig): boolean {
  return Boolean(config.enabled && config.publicKey && config.secretKey);
}
