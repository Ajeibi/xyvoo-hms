import HMSLayout from "@/components/hms/HMSLayout";
import { KitchenHistoryClient } from "@/components/hms/kitchen/KitchenHistoryClient";
import { KitchenShell } from "@/components/hms/kitchen/KitchenShell";
import { getHmsAccessContext } from "@/lib/hms/access";
import { loadKitchenHistoryPageModel } from "@/lib/hms/load-fb-pages";

export default async function KitchenHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [model, access] = await Promise.all([
    loadKitchenHistoryPageModel(slug),
    getHmsAccessContext(slug),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="kitchen">
      {model ? (
        <KitchenShell
          slug={model.slug}
          tenantId={model.tenantId}
          observerMode={access.canAccessAllDepartments}
          showDepartmentNav={access.canAccessAllDepartments}
        >
          <KitchenHistoryClient
            slug={model.slug}
            tenantId={model.tenantId}
            currency={model.currency}
            initial={model.initial}
            overdueMinutes={model.kitchenOverdueMinutes}
          />
        </KitchenShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
