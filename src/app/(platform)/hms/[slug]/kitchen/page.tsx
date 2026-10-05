import HMSLayout from "@/components/hms/HMSLayout";
import { KitchenShell } from "@/components/hms/kitchen/KitchenShell";
import { KitchenKdsClient } from "@/components/hms/kitchen/KitchenKdsClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { loadKitchenKdsPageModel } from "@/lib/hms/load-fb-pages";

export default async function KitchenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [model, access] = await Promise.all([
    loadKitchenKdsPageModel(slug),
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
          <KitchenKdsClient
            slug={model.slug}
            tenantId={model.tenantId}
            initial={model.initial}
            kitchenOverdueMinutes={model.kitchenOverdueMinutes}
            observerMode={access.canAccessAllDepartments}
          />
        </KitchenShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
