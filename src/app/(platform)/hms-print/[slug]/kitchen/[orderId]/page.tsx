import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadKitchenTicketModel } from "@/lib/hms/load-fb-print";
import { FbKitchenTicket } from "@/components/hms/fb/print/FbKitchenTicket";
import { FbPrintFrame } from "@/components/hms/fb/print/FbPrintFrame";

export const metadata: Metadata = { title: "Print kitchen ticket", robots: { index: false } };

/** The kitchen's current work for an order, sized for a ticket printer. ?auto=1 opens the print dialog. */
export default async function FbKitchenTicketPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ slug, orderId }, query] = await Promise.all([params, searchParams]);
  const { model, denied } = await loadKitchenTicketModel(slug, orderId);
  if (denied === "signed_out") redirect(`/auth/login?from=${encodeURIComponent(`/hms-print/${slug}/kitchen/${orderId}`)}`);
  if (!model) {
    return (
      <p className="p-8 text-base text-slate-700">
        {denied === "forbidden"
          ? "You don't have access to kitchen tickets."
          : "Nothing for the kitchen on that order right now."}
      </p>
    );
  }
  return (
    <FbPrintFrame auto={query.auto === "1"} widthMm={query.width === "58" ? 58 : 80}>
      <FbKitchenTicket model={model} />
    </FbPrintFrame>
  );
}
