/*
 * Platform charges: what a hotel pays XYVOO itself, on XYVOO's own Paystack account.
 * Not guest payments (the HMS only records those) and not store sales (those use a per-store
 * Paystack subaccount in lib/store). Amounts are whole kobo, NGN only for now.
 */

export const CHARGE_STATUSES = ["pending", "paid", "failed", "refunded", "expired"] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export const HANDLER_STATUSES = ["none", "pending", "running", "done", "failed"] as const;
export type HandlerStatus = (typeof HANDLER_STATUSES)[number];

export type PlatformChargeRow = {
  id: string;
  tenantId: string;
  kind: string;
  description: string;
  amountKobo: number;
  currency: string;
  status: ChargeStatus;
  reference: string;
  accessCode: string | null;
  payerEmail: string | null;
  paidAt: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  handlerStatus: HandlerStatus;
  handlerError: string | null;
  handlerAttempts: number;
  handlerStartedAt: string | null;
  receiptSentAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

/** Reference prefix for platform charges; also the Paystack metadata `purpose`. */
export const CHARGE_REFERENCE_PREFIX = "xyhc_";
export const CHARGE_PURPOSE = "platform_charge";

/** A pending charge older than this is shown as expired unless Paystack says it was paid. */
export const CHARGE_EXPIRY_MS = 24 * 3_600_000;

/** A handler stuck in "running" this long is assumed dead (e.g. the server restarted) and may be re-claimed. */
export const HANDLER_STALE_MS = 5 * 60_000;

export function mapChargeRow(r: Record<string, unknown>): PlatformChargeRow {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    kind: r.kind as string,
    description: r.description as string,
    amountKobo: Number(r.amount_kobo),
    currency: (r.currency as string) || "NGN",
    status: r.status as ChargeStatus,
    reference: r.paystack_reference as string,
    accessCode: (r.paystack_access_code as string) ?? null,
    payerEmail: (r.payer_email as string) ?? null,
    paidAt: (r.paid_at as string) ?? null,
    failureReason: (r.failure_reason as string) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    handlerStatus: ((r.handler_status as HandlerStatus) ?? "none"),
    handlerError: (r.handler_error as string) ?? null,
    handlerAttempts: Number(r.handler_attempts ?? 0),
    handlerStartedAt: (r.handler_started_at as string) ?? null,
    receiptSentAt: (r.receipt_sent_at as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
    createdAt: r.created_at as string,
  };
}

/** What the browser is allowed to see of a charge (no access code, no internal handler details). */
export type PublicCharge = Pick<PlatformChargeRow, "id" | "kind" | "description" | "amountKobo" | "currency" | "status" | "reference" | "paidAt" | "createdAt"> & {
  /** Paid, but delivering what was bought hit a problem that we can retry. */
  needsAttention: boolean;
};

export function toPublicCharge(c: PlatformChargeRow): PublicCharge {
  return {
    id: c.id,
    kind: c.kind,
    description: c.description,
    amountKobo: c.amountKobo,
    currency: c.currency,
    status: c.status,
    reference: c.reference,
    paidAt: c.paidAt,
    createdAt: c.createdAt,
    needsAttention: c.status === "paid" && (c.handlerStatus === "failed" || c.handlerStatus === "pending"),
  };
}
