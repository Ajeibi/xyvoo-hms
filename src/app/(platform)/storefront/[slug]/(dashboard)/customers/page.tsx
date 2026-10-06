import type { Metadata } from "next";
import CustomersManager from "@/components/storefront/CustomersManager";

export const metadata: Metadata = { title: "Customers" };

export default async function StorefrontCustomersManagerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Customers</h1>
        <p className="mt-1 text-sm text-slate-500">Everyone who has ordered from you, grouped automatically, with your own notes.</p>
      </div>
      <CustomersManager slug={slug} />
    </div>
  );
}
