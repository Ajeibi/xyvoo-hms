import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import WebsiteEditor from "@/components/storefront/website-editor/WebsiteEditor";
import { DashPageHeader, dashButton } from "@/components/storefront/dashboard-blocks";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";

export const metadata: Metadata = {
  title: "Website",
};

export default async function StorefrontWebsitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  if (!getStoreCapabilities(access.role).canManageSettings) redirect(`/storefront/${slug}/dashboard`);

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[40rem] flex-col gap-4">
      <DashPageHeader
        title="Website"
        description="Make the shop yours. Your changes are saved as a draft, and customers only see them when you publish."
        actions={
          <Link href={`/storefront/${slug}/welcome/basics`} className={dashButton.secondary}>
            Go through setup again
          </Link>
        }
      />
      <div className="min-h-0 flex-1">
        <WebsiteEditor slug={slug} />
      </div>
    </div>
  );
}
