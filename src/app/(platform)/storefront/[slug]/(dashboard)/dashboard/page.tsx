import GoLiveChecklist from "@/components/storefront/GoLiveChecklist";
import StorefrontOverview from "@/components/storefront/StorefrontOverview";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";
import { getGoLiveStatus } from "@/lib/store/go-live";

export default async function StorefrontDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  const status = access.tenantId ? await getGoLiveStatus(access.tenantId) : null;

  return (
    <div className="space-y-6">
      {status ? (
        <GoLiveChecklist
          slug={slug}
          initial={status}
          canManage={getStoreCapabilities(access.role).canManageSettings}
          // The path-based address works everywhere; the subdomain needs Vercel's wildcard domain set up.
          liveUrl={`/shop/${slug}`}
        />
      ) : null}
      <StorefrontOverview slug={slug} />
    </div>
  );
}
