import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAccount } from "@/lib/payments/platform-paystack";
import { rateLimit } from "@/lib/rate-limit";
import { paystackFailure, resolveBillingRequest } from "@/lib/store/payout-routes";

const Schema = z.object({
  slug: z.string().min(1),
  bankCode: z.string().trim().min(1, "Choose your bank.").max(20),
  accountNumber: z.string().trim().regex(/^\d{8,16}$/, "Enter your account number, digits only."),
});

/** POST /api/store/payouts/resolve — looks up the account holder's name so the merchant can confirm it. */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });

  const resolved = await resolveBillingRequest(parsed.data.slug);
  if (resolved.error) return resolved.error;
  if (!rateLimit(`payout-resolve:${resolved.access.userId}`, 20, 15 * 60_000).ok) {
    return NextResponse.json({ error: "Too many lookups. Please wait a few minutes." }, { status: 429 });
  }

  try {
    return NextResponse.json({ accountName: await resolveAccount(resolved.platform, parsed.data.accountNumber, parsed.data.bankCode) });
  } catch (error) {
    return paystackFailure(error, "We couldn't check that account just now. Please try again.");
  }
}
