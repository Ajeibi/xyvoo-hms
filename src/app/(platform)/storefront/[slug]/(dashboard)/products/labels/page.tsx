import type { Metadata } from "next";
import BarcodeLabels from "@/components/storefront/BarcodeLabels";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Barcode labels" };

export default async function StorefrontBarcodeLabelsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "products");
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <DashPageHeader title="Barcode labels" description="Print labels for the barcodes you've saved on your products, to stick on shelves, boxes or hang tags." />
      </div>
      <BarcodeLabels slug={slug} />
    </div>
  );
}
