import type { Metadata } from "next";
import BlogManager from "@/components/storefront/BlogManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Blog" };

export default async function StorefrontBlogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "blog");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Blog" description="Share news, stories and advice. Posts help people find your shop on Google and give customers a reason to come back." />
      <BlogManager slug={slug} />
    </div>
  );
}
