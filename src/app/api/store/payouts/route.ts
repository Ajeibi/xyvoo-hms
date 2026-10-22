import { shopChanged } from "@/lib/store/site/shop-changed";
import { after, NextResponse } from "next/server";
import { alertOwnerMoneyChange, ownerOnlyMoney } from "@/lib/store/money-settings";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { diffFields, logActivity } from "@/lib/store/activity";
import { createSubaccount, getPlatformPaystack, resolveAccount, updateSubaccount } from "@/lib/payments/platform-paystack";
import { effectiveFeeRate } from "@/lib/store/billing";
import { getActivePayoutAccount, getStoreSubscription } from "@/lib/store/payments";
import { paystackFailure, resolveBillingRequest } from "@/lib/store/payout-routes";

/** GET /api/store/payouts?slug= — the store's payout account (masked) and whether payments can be set up. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) {
    return NextResponse.json({ error: "Only the store owner or an admin can see payout details." }, { status: 403 });
  }
  const account = await getActivePayoutAccount(resolved.access.tenantId);
  return NextResponse.json({
    paymentsAvailable: Boolean(getPlatformPaystack()),
    // Admins can see it; only the owner can change where the money goes.
    canManage: resolved.access.role === "owner",
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
  const notOwner = ownerOnlyMoney(access.role);
  if (notOwner) return notOwner;

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

    // Only the last four digits of the account number are ever logged.
    await logActivity({
      tenantId: access.tenantId,
      actor: access,
      area: "payouts",
      action: "updated",
      changes: diffFields(
        existing ? { business_name: existing.business_name, bank_name: existing.bank_name, account_name: existing.account_name, account_number_last4: existing.account_number_last4 } : {},
        { business_name: v.businessName, bank_name: v.bankName, account_name: accountName, account_number_last4: v.accountNumber.slice(-4) },
      ),
    });
    // The owner always hears about it, at their own sign-in email.
    const tenantId = access.tenantId;
    after(() =>
      alertOwnerMoneyChange(tenantId, access.userId, {
        title: existing ? "Your payout account was changed" : "A payout account was added",
        detail: existing ? "The bank account your shop's card payments are paid into has just been changed." : "A bank account for your shop's card payments has just been added.",
        rows: [
          ...(existing ? [{ label: "Was", value: `${existing.bank_name} ••••${existing.account_number_last4}` }] : []),
          { label: existing ? "Now" : "Account", value: `${v.bankName} ••••${v.accountNumber.slice(-4)} (${accountName})` },
        ],
      }),
    );
    // A shop with a payout account takes cards.
    shopChanged(access.tenantId);
    return NextResponse.json({ ok: true, accountName, accountNumberLast4: v.accountNumber.slice(-4) });
  } catch (error) {
    return paystackFailure(error, "We couldn't save your payout account just now. Please try again.");
  }
}
