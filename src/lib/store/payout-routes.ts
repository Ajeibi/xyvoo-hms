import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { getPlatformPaystack, PaystackError, type PlatformPaystack } from "@/lib/payments/platform-paystack";

/** Shared checks for the payout and billing API routes. */

export const PAYMENTS_NOT_READY = "Payments through XYVOO aren't switched on yet. Please contact XYVOO support.";

/** Owner or admin of the store, with XYVOO's Paystack account configured. */
export async function resolveBillingRequest(slug: string) {
  const resolved = await resolveStoreRequest(slug);
  if (resolved.error) return { error: resolved.error };
  if (!resolved.capabilities.canManageSettings) {
    return { error: NextResponse.json({ error: "Only the store owner or an admin can manage payments." }, { status: 403 }) };
  }
  const platform = getPlatformPaystack();
  if (!platform) return { error: NextResponse.json({ error: PAYMENTS_NOT_READY }, { status: 503 }) };
  return { ...resolved, platform: platform as PlatformPaystack };
}

export async function storeCurrency(tenantId: string, service: SupabaseClient) {
  const { data } = await service.schema("store").from("business_profile").select("currency_code").eq("tenant_id", tenantId).maybeSingle();
  return (data?.currency_code as string | undefined) || "NGN";
}

/** Paystack's own messages are safe to show ("Could not resolve account name"); anything else is generic. */
export function paystackFailure(error: unknown, fallback: string) {
  if (error instanceof PaystackError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error("[payments]", error);
  return NextResponse.json({ error: fallback }, { status: 502 });
}
