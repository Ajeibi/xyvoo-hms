import CollectionsManager from "@/components/storefront/CollectionsManager";

export default async function StorefrontCollectionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Collections</h1>
        <p className="mt-1 text-sm text-slate-500">Group products so customers can browse them together, like &ldquo;New in&rdquo; or &ldquo;Gifts under ₦10,000&rdquo;.</p>
      </div>
      <CollectionsManager slug={slug} />
    </div>
  );
}
