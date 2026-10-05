import { NextResponse } from "next/server";
import { listBanks } from "@/lib/payments/platform-paystack";
import { paystackFailure, resolveBillingRequest, storeCurrency } from "@/lib/store/payout-routes";

/** GET /api/store/payouts/banks?slug= — banks Paystack can pay this store's currency into. */
export async function GET(req: Request) {
  const resolved = await resolveBillingRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  try {
    const currency = await storeCurrency(resolved.access.tenantId, resolved.service);
    return NextResponse.json({ currency, banks: await listBanks(resolved.platform, currency) });
  } catch (error) {
    return paystackFailure(error, "We couldn't load the list of banks. Please try again.");
  }
}
