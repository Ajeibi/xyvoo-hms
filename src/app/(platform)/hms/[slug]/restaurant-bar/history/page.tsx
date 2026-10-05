import HMSLayout from "@/components/hms/HMSLayout";
import { FbOrderHistoryClient } from "@/components/hms/fb/FbOrderHistoryClient";
import { FbRestaurantBarShell } from "@/components/hms/fb/FbRestaurantBarShell";
import { getHmsAccessContext } from "@/lib/hms/access";
import { loadFbOrderHistoryPageModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [model, access] = await Promise.all([
    loadFbOrderHistoryPageModel(slug),
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
          <FbOrderHistoryClient
            slug={model.slug}
            tenantId={model.tenantId}
            currency={model.currency}
            initial={model.initial}
            showAmount
            showPaymentStatus
            showTimingFilter={false}
            timeMode="service"
            overdueMinutes={model.kitchenOverdueMinutes}
            description="Completed, voided, and payment-pending tickets (read-only)."
          />
        </FbRestaurantBarShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
