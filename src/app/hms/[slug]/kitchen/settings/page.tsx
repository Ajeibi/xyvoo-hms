import HMSLayout from "@/components/hms/HMSLayout";
import { KitchenSettingsClient } from "@/components/hms/kitchen/KitchenSettingsClient";
import { KitchenShell } from "@/components/hms/kitchen/KitchenShell";
import { getHmsAccessContext } from "@/lib/hms/access";
import { loadKitchenSettingsPageModel } from "@/lib/hms/load-fb-pages";

export default async function KitchenSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [model, access] = await Promise.all([
    loadKitchenSettingsPageModel(slug),
    getHmsAccessContext(slug),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="kitchen-settings">
      {model ? (
        <KitchenShell
          slug={model.slug}
          tenantId={model.tenantId}
          observerMode={access.canAccessAllDepartments}
          showDepartmentNav={access.canAccessAllDepartments}
        >
          <KitchenSettingsClient
            slug={model.slug}
            initial={model.initial}
            categories={model.categories}
          />
        </KitchenShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
