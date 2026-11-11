import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HANDLER_STALE_MS, mapChargeRow, type ChargeStatus, type HandlerStatus, type PlatformChargeRow } from "./types";

/**
 * The charges table, behind a small interface so the settle logic (charges.ts) can be tested
 * without a database. Every state change is a conditional update, so two callers racing
 * (the return page and the webhook) can't both win.
 */
export type ChargeStore = {
  insert(row: {
    tenantId: string;
    kind: string;
    description: string;
    amountKobo: number;
    currency: string;
    reference: string;
    payerEmail: string;
    metadata: Record<string, unknown>;
    createdBy: string | null;
  }): Promise<PlatformChargeRow>;
  byReference(reference: string): Promise<PlatformChargeRow | null>;
  setAccessCode(id: string, accessCode: string | null): Promise<void>;
  /** pending/failed/expired -> paid. Returns the row only for the caller that made the change. */
  markPaid(id: string, paidAt: string, handlerStatus: HandlerStatus): Promise<PlatformChargeRow | null>;
  /** pending/failed/expired -> status. Never touches a paid or refunded charge. */
  markNotPaid(id: string, status: Extract<ChargeStatus, "failed" | "expired" | "pending">, reason: string | null): Promise<void>;
  /** pending/failed (or running for too long) -> running. Returns the row only for the one caller that claimed it. */
  claimHandler(charge: PlatformChargeRow, now: Date): Promise<PlatformChargeRow | null>;
  finishHandler(id: string, ok: boolean, error: string | null, now: Date): Promise<void>;
  markReceiptSent(id: string, now: Date): Promise<void>;
  list(tenantId: string, limit: number): Promise<PlatformChargeRow[]>;
};

const T = "platform_charges";

export function supabaseChargeStore(service: SupabaseClient = createServerSupabaseClient()): ChargeStore {
  const table = () => service.schema("hotel").from(T);
  return {
    async insert(r) {
      const { data, error } = await table()
        .insert({
          tenant_id: r.tenantId,
          kind: r.kind,
          description: r.description,
          amount_kobo: r.amountKobo,
          currency: r.currency,
          paystack_reference: r.reference,
          payer_email: r.payerEmail,
          metadata: r.metadata,
          created_by: r.createdBy,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Could not record the charge.");
      return mapChargeRow(data);
    },
    async byReference(reference) {
      const { data, error } = await table().select("*").eq("paystack_reference", reference).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapChargeRow(data) : null;
    },
    async setAccessCode(id, accessCode) {
      await table().update({ paystack_access_code: accessCode, updated_at: new Date().toISOString() }).eq("id", id);
    },
    async markPaid(id, paidAt, handlerStatus) {
      const { data, error } = await table()
        .update({ status: "paid", paid_at: paidAt, failure_reason: null, handler_status: handlerStatus, updated_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", ["pending", "failed", "expired"])
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapChargeRow(data) : null;
    },
    async markNotPaid(id, status, reason) {
      const { error } = await table()
        .update({ status, failure_reason: reason, updated_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", ["pending", "failed", "expired"]);
      if (error) throw new Error(error.message);
    },
    async claimHandler(charge, now) {
      const staleBefore = new Date(now.getTime() - HANDLER_STALE_MS).toISOString();
      const { data, error } = await table()
        .update({
          handler_status: "running",
          handler_started_at: now.toISOString(),
          handler_attempts: charge.handlerAttempts + 1,
          updated_at: now.toISOString(),
        })
        .eq("id", charge.id)
        .eq("status", "paid")
        // The attempts count doubles as a version number: only one racing caller sees it unchanged.
        .eq("handler_attempts", charge.handlerAttempts)
        .or(`handler_status.in.(pending,failed),and(handler_status.eq.running,handler_started_at.lt.${staleBefore})`)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapChargeRow(data) : null;
    },
    async finishHandler(id, ok, error, now) {
      await table()
        .update({
          handler_status: ok ? "done" : "failed",
          handler_error: ok ? null : error,
          handler_done_at: ok ? now.toISOString() : null,
          updated_at: now.toISOString(),
        })
        .eq("id", id);
    },
    async markReceiptSent(id, now) {
      await table().update({ receipt_sent_at: now.toISOString() }).eq("id", id);
    },
    async list(tenantId, limit) {
      const { data, error } = await table().select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapChargeRow);
    },
  };
}
