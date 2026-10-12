import { z } from "zod";

/*
 * Offline payment options a shop can offer at checkout, alongside (or instead
 * of) card payments: bank transfer into the shop's account, payment on
 * delivery, and arranging the order on WhatsApp. Stored on
 * store.business_profile.offline_payments.
 */

export const OFFLINE_METHODS = ["bank_transfer", "pay_on_delivery", "whatsapp"] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];
export type CheckoutPaymentMethod = "card" | OfflineMethod;

/** What's written on the order (store.orders.payment_method). */
export const PAYMENT_METHOD_LABELS: Record<CheckoutPaymentMethod, string> = {
  card: "Card",
  bank_transfer: "Bank Transfer",
  pay_on_delivery: "Pay on Delivery",
  whatsapp: "WhatsApp",
};

const note = z.string().trim().max(300).default("");

export const offlinePaymentsSchema = z.object({
  bankTransfer: z
    .object({
      enabled: z.boolean().default(false),
      bankName: z.string().trim().max(80).default(""),
      accountName: z.string().trim().max(120).default(""),
      accountNumber: z.string().trim().max(20).default(""),
      note,
    })
    .default({ enabled: false, bankName: "", accountName: "", accountNumber: "", note: "" })
    .refine((b) => !b.enabled || (b.bankName && b.accountName && /^[0-9]{6,20}$/.test(b.accountNumber)), {
      message: "Add the bank name, account name and account number (digits only) to offer bank transfer.",
    }),
  payOnDelivery: z.object({ enabled: z.boolean().default(false), note }).default({ enabled: false, note: "" }),
  whatsapp: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
});
export type OfflinePayments = z.infer<typeof offlinePaymentsSchema>;

export const NO_OFFLINE_PAYMENTS: OfflinePayments = offlinePaymentsSchema.parse({});

/** Reads the stored settings, falling back to "nothing offered" for anything invalid. */
export function parseOfflinePayments(value: unknown): OfflinePayments {
  const parsed = offlinePaymentsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : NO_OFFLINE_PAYMENTS;
}

/** The payment methods a shopper can choose, in the order shown at checkout. */
export function availablePaymentMethods(input: { acceptsCard: boolean; offline: OfflinePayments; whatsappNumber: string | null }): CheckoutPaymentMethod[] {
  const methods: CheckoutPaymentMethod[] = [];
  if (input.acceptsCard) methods.push("card");
  if (input.offline.bankTransfer.enabled) methods.push("bank_transfer");
  if (input.offline.payOnDelivery.enabled) methods.push("pay_on_delivery");
  if (input.offline.whatsapp.enabled && input.whatsappNumber) methods.push("whatsapp");
  return methods;
}
