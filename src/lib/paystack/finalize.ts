import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { insertFolioLine } from "@/lib/hms/folio";
import { notifyPaymentReceived } from "@/lib/hms/notification-rules";
import { paystackVerifyTransaction } from "./client";
import { getPaystackConfig } from "./config";
import type { PaystackVerifyData, PaymentIntentRow } from "./types";

function mapIntentRow(row: Record<string, unknown>): PaymentIntentRow {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    reservation_id: (row.reservation_id as string | null) ?? null,
    amount: Number(row.amount),
    currency_code: (row.currency_code as string) ?? "NGN",
    purpose: row.purpose as PaymentIntentRow["purpose"],
    paystack_reference: row.paystack_reference as string,
    authorization_code: (row.authorization_code as string | null) ?? null,
    status: row.status as PaymentIntentRow["status"],
    folio_transaction_id: (row.folio_transaction_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function extractPaymentMetadata(data: PaystackVerifyData) {
  return {
    provider: "paystack" as const,
    authorization_code: data.authorization?.authorization_code ?? null,
    channel: data.authorization?.channel ?? null,
    last4: data.authorization?.last4 ?? null,
    card_type: data.authorization?.card_type ?? null,
    gateway_response: data.gateway_response ?? null,
  };
}

export async function loadPaymentIntentByReference(
  supabase: SupabaseClient,
  reference: string,
): Promise<PaymentIntentRow | null> {
  const { data } = await supabase
    .schema("hotel")
    .from("payment_intents")
    .select("*")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (!data) return null;
  return mapIntentRow(data as Record<string, unknown>);
}

export async function finalizePaystackPayment(params: {
  supabase: SupabaseClient;
  tenant: { id: string; paystack_setup?: unknown };
  reference: string;
  actorUserId?: string | null;
  folioNumber?: string | null;
}): Promise<
  | { ok: true; intent: PaymentIntentRow; folioLineId: string | null; alreadyFinalized: boolean }
  | { ok: false; error: string }
> {
  const config = getPaystackConfig(params.tenant);
  if (!config.secretKey) {
    return { ok: false, error: "Paystack secret key not configured." };
  }

  const intent = await loadPaymentIntentByReference(params.supabase, params.reference);
  if (!intent) return { ok: false, error: "Payment intent not found." };

  if (intent.status === "success" && intent.folio_transaction_id) {
    return {
      ok: true,
      intent,
      folioLineId: intent.folio_transaction_id,
      alreadyFinalized: true,
    };
  }

  const verify = await paystackVerifyTransaction(config.secretKey, params.reference);
  if (!verify.ok) return { ok: false, error: verify.message };

  const data = verify.data;
  const paid = data.status === "success";
  const meta = extractPaymentMetadata(data);
  const now = new Date().toISOString();

  if (!paid) {
    await params.supabase
      .schema("hotel")
      .from("payment_intents")
      .update({
        status: "failed",
        metadata: { ...intent.metadata, ...meta, verifyStatus: data.status },
        updated_at: now,
      })
      .eq("id", intent.id);
    return { ok: false, error: `Payment not successful (${data.status}).` };
  }

  const expectedKobo = Math.round(intent.amount * 100);
  if (data.amount !== expectedKobo) {
    return { ok: false, error: "Paid amount does not match intent." };
  }

  let folioLineId = intent.folio_transaction_id;

  if (!folioLineId && intent.reservation_id && intent.purpose !== "registration") {
    if (intent.purpose === "preauth") {
      // Authorization only — no folio payment line until capture at checkout.
      await params.supabase
        .schema("hotel")
        .from("reservations")
        .update({ preauth_amount: intent.amount })
        .eq("id", intent.reservation_id)
        .eq("tenant_id", intent.tenant_id);
    } else {
      const postedBy = params.actorUserId ?? intent.created_by ?? intent.tenant_id;
      const description = "Payment (Paystack card)";

      const { line, error } = await insertFolioLine(params.supabase, {
        tenantId: intent.tenant_id,
        reservationId: intent.reservation_id,
        kind: "payment",
        amount: intent.amount,
        method: "card",
        description,
        postedBy,
        reference: params.reference,
        metadata: meta,
      });
      if (error || !line) return { ok: false, error: error ?? "Could not post folio payment." };
      folioLineId = line.id;

      await writeAuditLog({
        tenantId: intent.tenant_id,
        actorUserId: postedBy,
        action: "folio_payment_posted",
        entityType: "folio_transaction",
        entityId: line.id,
        after: { amount: intent.amount, method: "card", provider: "paystack", reference: params.reference },
      });

      if (params.folioNumber) {
        await notifyPaymentReceived({
          tenantId: intent.tenant_id,
          amount: intent.amount,
          method: "card",
          folioNumber: params.folioNumber,
          entityId: line.id,
        });
      }
    }
  }

  const { data: updated } = await params.supabase
    .schema("hotel")
    .from("payment_intents")
    .update({
      status: "success",
      authorization_code: meta.authorization_code,
      folio_transaction_id: folioLineId,
      metadata: { ...intent.metadata, ...meta },
      updated_at: now,
    })
    .eq("id", intent.id)
    .select("*")
    .single();

  return {
    ok: true,
    intent: updated ? mapIntentRow(updated as Record<string, unknown>) : intent,
    folioLineId,
    alreadyFinalized: false,
  };
}

export async function reservationHasPaystackPayment(
  supabase: SupabaseClient,
  tenantId: string,
  reservationId: string,
): Promise<boolean> {
  const { count: intentCount } = await supabase
    .schema("hotel")
    .from("payment_intents")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .eq("status", "success");

  if ((intentCount ?? 0) > 0) return true;

  const lines = await supabase
    .schema("hotel")
    .from("folio_transactions")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .eq("kind", "payment")
    .is("voided_at", null);

  return (lines.data ?? []).some((l) => {
    const m = l.metadata as Record<string, unknown> | null;
    return m?.provider === "paystack";
  });
}

export async function getSuccessfulPreauthIntent(
  supabase: SupabaseClient,
  tenantId: string,
  reservationId: string,
): Promise<PaymentIntentRow | null> {
  const { data } = await supabase
    .schema("hotel")
    .from("payment_intents")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .eq("purpose", "preauth")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return mapIntentRow(data as Record<string, unknown>);
}
