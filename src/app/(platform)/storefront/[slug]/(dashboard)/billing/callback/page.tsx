import BillingCallback from "@/components/storefront/BillingCallback";

/** Where Paystack sends the owner back after paying for the Standard plan. */
export default async function BillingCallbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const { slug } = await params;
  const { reference, trxref } = await searchParams;
  return <BillingCallback slug={slug} reference={reference || trxref || ""} />;
}
