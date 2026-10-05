import HMSLayout from "@/components/hms/HMSLayout";
import { FbRestaurantBarShell } from "@/components/hms/fb/FbRestaurantBarShell";
import { FbTablesClient } from "@/components/hms/fb/FbTablesClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { loadFbTablesPageModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarTablesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [model, access] = await Promise.all([
    loadFbTablesPageModel(slug),
    getHmsAccessContext(slug),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar">
      {model ? (
        <FbRestaurantBarShell
          slug={model.slug}
          tenantId={model.tenantId}
          observerMode={access.canAccessAllDepartments}
          showDepartmentNav={access.canAccessAllDepartments}
        >
          <FbTablesClient
            slug={model.slug}
            tenantId={model.tenantId}
            outletId={model.outletId}
            initial={model.initial}
          />
        </FbRestaurantBarShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
