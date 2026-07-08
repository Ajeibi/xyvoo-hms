import HMSLayout from "@/components/hms/HMSLayout";
import { FbRestaurantBarShell } from "@/components/hms/fb/FbRestaurantBarShell";
import { FbPosClient } from "@/components/hms/fb/FbPosClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { loadFbPosPageModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [model, access] = await Promise.all([loadFbPosPageModel(slug), getHmsAccessContext(slug)]);

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar">
      {model ? (
        <FbRestaurantBarShell
          slug={model.slug}
          tenantId={model.tenantId}
          observerMode={access.canAccessAllDepartments}
          showDepartmentNav={access.canAccessAllDepartments}
        >
          <FbPosClient
            slug={model.slug}
            tenantId={model.tenantId}
            currency={model.currency}
            initial={model.initial}
          />
        </FbRestaurantBarShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
