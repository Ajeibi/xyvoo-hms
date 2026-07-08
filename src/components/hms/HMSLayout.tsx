import { redirect } from "next/navigation";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { getHmsAccessContext, hasSectionAccess } from "@/lib/hms/access";

/**
 * Section-guard component used by individual HMS pages.
 *
 * The persistent shell (sidebar + header) is rendered by the route layout at
 * src/app/hms/[slug]/layout.tsx — do NOT render HMSLayoutShell here or you
 * will get a double shell. This component only enforces section-level access
 * control and passes children straight through.
 */
export default async function HMSLayout({
  children,
  slug,
  requiredSection,
}: {
  children: React.ReactNode;
  slug: string;
  requiredSection?: HmsSectionKey;
}) {
  const access = await getHmsAccessContext(slug);

  if (!access.userId) {
    redirect(access.homePath);
  }

  if (requiredSection && !hasSectionAccess(access, requiredSection)) {
    redirect(access.homePath);
  }

  return <>{children}</>;
}
