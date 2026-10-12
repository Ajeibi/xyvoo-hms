import type { Metadata } from "next";
import CustomersManager from "@/components/storefront/CustomersManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";

export const metadata: Metadata = { title: "Customers" };

export default async function StorefrontCustomersManagerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="space-y-6">
      <DashPageHeader title="Customers" description="Everyone who has ordered from you, grouped automatically, with your own notes." />
      <CustomersManager slug={slug} />
    </div>
  );
}
