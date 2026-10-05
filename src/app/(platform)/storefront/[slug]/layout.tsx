import { redirect } from "next/navigation";
import { getStoreAccessContext } from "@/lib/store/access";

/**
 * Members only, for everything under /storefront/<slug>: the dashboard
 * (with its sidebar, in (dashboard)/layout.tsx) and the setup wizard
 * (welcome/, full screen).
 */
export default async function StorefrontSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);

  if (!access.userId || !access.tenantId || !access.role) {
    redirect(access.homePath);
  }

  return children;
}
