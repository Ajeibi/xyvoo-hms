import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SimulatedPayment from "@/components/storefront-theme/SimulatedPayment";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStorefront } from "@/lib/store/site/storefront";
import { isSimulatedIntent, simulatedPaymentsEnabled } from "@/lib/payments/simulated";

export const metadata: Metadata = { title: "Test payment", robots: { index: false, follow: false } };

/** The pretend payment page. Only exists while PAYMENTS_SIMULATE=1 in a non-production build. */
export default async function SimulatedPaymentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ reference?: string }> }) {
  if (!simulatedPaymentsEnabled()) notFound();
  const storefront = await getStorefront((await params).slug);
  const { reference } = await searchParams;
  if (!storefront || !reference || !/^[0-9a-f-]{36}$/i.test(reference)) notFound();
  const { data: intent } = await createServerSupabaseClient()
    .schema("store")
    .from("payment_intents")
    .select("tenant_id, amount, currency_code, metadata")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (!intent || intent.tenant_id !== storefront.tenant.id || !isSimulatedIntent(intent.metadata)) notFound();
  return (
    <div className="container section">
      <SimulatedPayment reference={reference} amount={Number(intent.amount) || 0} currency={(intent.currency_code as string) || "NGN"} storeName={storefront.storeName} />
    </div>
  );
}
