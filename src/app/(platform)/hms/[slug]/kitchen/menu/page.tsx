import HMSLayout from "@/components/hms/HMSLayout";
import { KitchenMenuClient } from "@/components/hms/kitchen/KitchenMenuClient";
import { KitchenShell } from "@/components/hms/kitchen/KitchenShell";
import { getHmsAccessContext } from "@/lib/hms/access";
import { loadKitchenMenuPageModel } from "@/lib/hms/load-fb-pages";

export default async function KitchenMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [model, access] = await Promise.all([
    loadKitchenMenuPageModel(slug),
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
          <KitchenMenuClient slug={model.slug} tenantId={model.tenantId} initial={model.initial} />
        </KitchenShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
