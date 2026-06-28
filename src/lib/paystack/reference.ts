/** Paystack reference: max 100 chars, alphanumeric + dash/underscore. */
export function buildPaystackReference(tenantId: string, intentId: string): string {
  const short = tenantId.replace(/-/g, "").slice(0, 8);
  return `XYV-${short}-${intentId.replace(/-/g, "").slice(0, 12)}`;
}
