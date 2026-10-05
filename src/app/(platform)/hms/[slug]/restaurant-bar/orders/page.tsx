import HMSLayout from "@/components/hms/HMSLayout";
import { FbRestaurantBarShell } from "@/components/hms/fb/FbRestaurantBarShell";
import { FbOrdersClient } from "@/components/hms/fb/FbOrdersClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { loadFbOrdersPageModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarOrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [model, access] = await Promise.all([
    loadFbOrdersPageModel(slug),
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
          <FbOrdersClient
            slug={model.slug}
            tenantId={model.tenantId}
            currency={model.currency}
            initial={model.initial}
            kitchenOverdueMinutes={model.kitchenOverdueMinutes}
          />
        </FbRestaurantBarShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
