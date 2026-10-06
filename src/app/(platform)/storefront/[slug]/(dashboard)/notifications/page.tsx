import type { Metadata } from "next";
import NotificationsManager from "@/components/storefront/NotificationsManager";
import { getStoreAccessContext } from "@/lib/store/access";

export const metadata: Metadata = { title: "Notifications" };

export default async function StorefrontNotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">Send a message that pops up on your customers&rsquo; phones, like a notification from any app.</p>
      </div>
      <NotificationsManager slug={slug} storeName={access.storeDisplayName} />
    </div>
  );
}
