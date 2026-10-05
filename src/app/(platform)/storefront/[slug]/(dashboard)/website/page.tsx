import { redirect } from "next/navigation";
import WebsiteEditor from "@/components/storefront/website-editor/WebsiteEditor";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";

export default async function StorefrontWebsitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  if (!getStoreCapabilities(access.role).canManageSettings) redirect(`/storefront/${slug}/dashboard`);

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[40rem] flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Website</h1>
        <p className="mt-1 text-sm text-slate-500">Make the shop yours. Changes are saved as a draft and only go live when you publish.</p>
      </div>
      <div className="min-h-0 flex-1">
        <WebsiteEditor slug={slug} />
      </div>
    </div>
  );
}
