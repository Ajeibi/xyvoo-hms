import StoreDetailsForm from "@/components/storefront/StoreDetailsForm";

export default async function StorefrontSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Store details</h1>
        <p className="mt-1 text-sm text-slate-500">Your store&rsquo;s name and the contact details customers see.</p>
      </div>
      <StoreDetailsForm slug={slug} />
    </div>
  );
}
