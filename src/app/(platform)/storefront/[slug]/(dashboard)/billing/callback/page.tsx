import type { Metadata } from "next";
import BillingCallback from "@/components/storefront/BillingCallback";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = {
  title: "Plan billing",
};

/** Where Paystack sends the owner back after paying for the Standard plan. */
export default async function BillingCallbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const { slug } = await params;
  await requireStoreSection(slug, "payments");
  const { reference, trxref } = await searchParams;
  return <BillingCallback slug={slug} reference={reference || trxref || ""} />;
}
