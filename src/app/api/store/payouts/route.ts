import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { createSubaccount, getPlatformPaystack, resolveAccount, updateSubaccount } from "@/lib/payments/platform-paystack";
import { effectiveFeeRate } from "@/lib/store/billing";
import { getActivePayoutAccount, getStoreSubscription } from "@/lib/store/payments";
import { paystackFailure, resolveBillingRequest } from "@/lib/store/payout-routes";

/** GET /api/store/payouts?slug= — the store's payout account (masked) and whether payments can be set up. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const account = await getActivePayoutAccount(resolved.access.tenantId);
  return NextResponse.json({
    paymentsAvailable: Boolean(getPlatformPaystack()),
    canManage: resolved.capabilities.canManageSettings,
    account: account
      ? {
          businessName: account.business_name,
          bankName: account.bank_name,
          bankCode: account.bank_code,
          accountName: account.account_name,
          accountNumberLast4: account.account_number_last4,
          verifiedAt: account.verified_at,
        }
      : null,
  });
}

const SaveSchema = z.object({
  slug: z.string().min(1),
  businessName: z.string().trim().min(2, "Enter the business name for payouts.").max(100),
  bankCode: z.string().trim().min(1, "Choose your bank.").max(20),
  bankName: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().regex(/^\d{8,16}$/, "Enter your account number, digits only."),
});

/**
 * POST /api/store/payouts — creates or updates the store's Paystack
 * subaccount. The account name is looked up again here rather than trusted
 * from the browser, and only the last four digits are kept.
 */
export async function POST(req: Request) {
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });
  const v = parsed.data;

  const resolved = await resolveBillingRequest(v.slug);
  if (resolved.error) return resolved.error;
  const { access, service, platform } = resolved;

  try {
    const accountName = await resolveAccount(platform, v.accountNumber, v.bankCode);
    const percentageCharge = Math.round(effectiveFeeRate(await getStoreSubscription(access.tenantId)) * 10_000) / 100;
    const existing = await getActivePayoutAccount(access.tenantId);

    let subaccountCode = existing?.subaccount_code;
    if (subaccountCode) {
      await updateSubaccount(platform, subaccountCode, { businessName: v.businessName, bankCode: v.bankCode, accountNumber: v.accountNumber, percentageCharge });
    } else {
      const { data: owner } = await service.auth.admin.getUserById(access.userId);
      ({ subaccountCode } = await createSubaccount(platform, {
        businessName: v.businessName,
        bankCode: v.bankCode,
        accountNumber: v.accountNumber,
        percentageCharge,
        email: owner.user?.email ?? null,
      }));
    }

    const { error } = await service
      .schema("store")
      .from("payout_accounts")
      .upsert(
        {
          tenant_id: access.tenantId,
          subaccount_code: subaccountCode,
          business_name: v.businessName,
          bank_code: v.bankCode,
          bank_name: v.bankName,
          account_name: accountName,
          account_number_last4: v.accountNumber.slice(-4),
          is_active: true,
          verified_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, accountName, accountNumberLast4: v.accountNumber.slice(-4) });
  } catch (error) {
    return paystackFailure(error, "We couldn't save your payout account just now. Please try again.");
  }
}
