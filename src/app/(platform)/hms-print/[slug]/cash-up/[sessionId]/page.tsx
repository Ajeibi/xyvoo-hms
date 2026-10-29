import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadCashUpReportModel } from "@/lib/hms/load-fb-print";
import { FbPrintFrame } from "@/components/hms/fb/print/FbPrintFrame";
import { FbCashUpReport } from "@/components/hms/fb/print/FbCashUpReport";

export const metadata: Metadata = { title: "Cash-up report", robots: { index: false } };

/** A till's end-of-shift report sized for a receipt printer. ?auto=1 opens the print dialog; ?width=58 for 58mm paper. */
export default async function FbCashUpPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ slug, sessionId }, query] = await Promise.all([params, searchParams]);
  const { model, denied } = await loadCashUpReportModel(slug, sessionId);
  if (denied === "signed_out") redirect(`/auth/login?from=${encodeURIComponent(`/hms-print/${slug}/cash-up/${sessionId}`)}`);
  if (!model) {
    return (
      <p className="p-8 text-base text-slate-700">
        {denied === "forbidden" ? "Only managers can see a till's report before it is closed." : "That cash-up wasn't found."}
      </p>
    );
  }
  return (
    <FbPrintFrame auto={query.auto === "1"} widthMm={query.width === "58" ? 58 : 80}>
      <FbCashUpReport model={model} />
    </FbPrintFrame>
  );
}
