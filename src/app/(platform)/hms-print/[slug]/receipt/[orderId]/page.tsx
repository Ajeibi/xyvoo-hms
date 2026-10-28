import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadReceiptModel } from "@/lib/hms/load-fb-print";
import { FbPrintFrame } from "@/components/hms/fb/print/FbPrintFrame";
import { FbReceipt } from "@/components/hms/fb/print/FbReceipt";

export const metadata: Metadata = { title: "Print bill", robots: { index: false } };

/** A bill or receipt sized for a receipt printer. ?auto=1 opens the print dialog; ?width=58 for 58mm paper. */
export default async function FbReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ slug, orderId }, query] = await Promise.all([params, searchParams]);
  const { model, denied } = await loadReceiptModel(slug, orderId);
  if (denied === "signed_out") redirect(`/auth/login?from=${encodeURIComponent(`/hms-print/${slug}/receipt/${orderId}`)}`);
  if (!model) {
    return (
      <p className="p-8 text-base text-slate-700">
        {denied === "forbidden" ? "You don't have access to restaurant bills." : "That bill wasn't found."}
      </p>
    );
  }
  return (
    <FbPrintFrame auto={query.auto === "1"} widthMm={query.width === "58" ? 58 : 80}>
      <FbReceipt model={model} />
    </FbPrintFrame>
  );
}
